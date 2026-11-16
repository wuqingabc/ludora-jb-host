#include "tls.h"

/*
 * Skip-verify engine vtable methods.
 *
 * BearSSL feeds each certificate in the server's chain through
 * start_cert -> append* -> end_cert, in order (end-entity first). We only
 * decode the *first* certificate (the leaf) and copy out its public key; once
 * captured we stop feeding the decoder so the decoder's internal buffer (which
 * the returned `br_x509_pkey` points into) is never reused.
 */

static void
xnv_start_chain(const br_x509_class **ctx, const char *server_name)
{
	ludora_x509_noverify *xc = (ludora_x509_noverify *)(void *)ctx;

	(void)server_name;
	br_x509_decoder_init(&xc->dec, 0, 0);
	xc->have_key = 0;
}

static void
xnv_start_cert(const br_x509_class **ctx, uint32_t length)
{
	ludora_x509_noverify *xc = (ludora_x509_noverify *)(void *)ctx;

	(void)length;
	if (xc->have_key) {
		return;
	}
	br_x509_decoder_init(&xc->dec, 0, 0);
}

static void
xnv_append(const br_x509_class **ctx, const unsigned char *buf, size_t len)
{
	ludora_x509_noverify *xc = (ludora_x509_noverify *)(void *)ctx;

	if (xc->have_key) {
		return;
	}
	br_x509_decoder_push(&xc->dec, buf, len);
}

static void
xnv_end_cert(const br_x509_class **ctx)
{
	ludora_x509_noverify *xc = (ludora_x509_noverify *)(void *)ctx;
	const br_x509_pkey *pk;

	if (xc->have_key) {
		return;
	}
	pk = br_x509_decoder_get_pkey(&xc->dec);
	if (pk != NULL) {
		xc->pkey = *pk;
		xc->have_key = 1;
	}
}

static unsigned
xnv_end_chain(const br_x509_class **ctx)
{
	ludora_x509_noverify *xc = (ludora_x509_noverify *)(void *)ctx;

	return xc->have_key ? 0 : BR_ERR_X509_EMPTY_CHAIN;
}

static const br_x509_pkey *
xnv_get_pkey(const br_x509_class *const *ctx, unsigned *usages)
{
	ludora_x509_noverify *xc = (ludora_x509_noverify *)(void *)ctx;

	if (usages != NULL) {
		*usages = BR_KEYTYPE_SIGN | BR_KEYTYPE_KEYX;
	}
	return xc->have_key ? &xc->pkey : NULL;
}

static const br_x509_class xnv_vtable = {
	sizeof(ludora_x509_noverify),
	xnv_start_chain,
	xnv_start_cert,
	xnv_append,
	xnv_end_cert,
	xnv_end_chain,
	xnv_get_pkey
};

void
ludora_x509_noverify_init(ludora_x509_noverify *xc)
{
	xc->vtable = &xnv_vtable;
	xc->have_key = 0;
}

void
ludora_tls_client_init(br_ssl_client_context *cc, ludora_x509_noverify *xc)
{
	static const uint16_t suites[] = {
		BR_TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
		BR_TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384
	};

	br_ssl_client_zero(cc);
	br_ssl_engine_set_versions(&cc->eng, BR_TLS12, BR_TLS12);

	br_ssl_engine_set_suites(&cc->eng, suites,
		(sizeof suites) / (sizeof suites[0]));

	/* ECDHE key exchange + ECDSA signature verification. */
	br_ssl_engine_set_default_ecdsa(&cc->eng);

	/* Hash functions required by the above suites. */
	br_ssl_engine_set_hash(&cc->eng, br_sha256_ID, &br_sha256_vtable);
	br_ssl_engine_set_hash(&cc->eng, br_sha384_ID, &br_sha384_vtable);
	br_ssl_engine_set_hash(&cc->eng, br_sha1_ID, &br_sha1_vtable);

	/* Skip-verify X.509 engine. */
	br_ssl_engine_set_x509(&cc->eng, &xc->vtable);

	/* TLS 1.2 PRF. */
	br_ssl_engine_set_prf_sha256(&cc->eng, &br_tls12_sha256_prf);
	br_ssl_engine_set_prf_sha384(&cc->eng, &br_tls12_sha384_prf);

	/* Record cipher: AES-GCM only. */
	br_ssl_engine_set_default_aes_gcm(&cc->eng);
}
