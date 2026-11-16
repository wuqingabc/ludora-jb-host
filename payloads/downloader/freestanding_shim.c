/*
 * Freestanding libc shims + OS randomness for the BearSSL-backed downloader.
 *
 * The downloader is linked with -nostdlib, so BearSSL (which assumes memcpy/
 * memset/memmove/memcmp/strlen) needs these minimal implementations. We also
 * provide `br_prng_seeder_system()` so BearSSL's engine can seed its internal
 * HMAC-DRBG without libc: it reads /dev/urandom through raw FreeBSD syscalls
 * and, if that is unavailable, falls back to RDTSC + address entropy.
 *
 * Note the downloader's real security boundary is the pinned SHA-256 of the
 * package; TLS here is transport privacy/obfuscation, so a degraded entropy
 * source does not weaken the integrity guarantee.
 */

#include <stddef.h>
#include <stdint.h>

#include "bearssl.h"

/* ---- FreeBSD/PS4 syscall numbers (amd64) ---- */
#define SYS_read 3
#define SYS_open 5
#define SYS_close 6

#define O_RDONLY 0x0000

static long
sys1(long number, long arg1)
{
	long r;
	__asm__ volatile("syscall\n\t"
		"jnc 1f\n\t"
		"negq %%rax\n\t"
		"1:"
		: "=a"(r) : "a"(number), "D"(arg1) : "rcx", "r11", "memory");
	return r;
}

static long
sys3(long number, long arg1, long arg2, long arg3)
{
	long r;
	__asm__ volatile("syscall\n\t"
		"jnc 1f\n\t"
		"negq %%rax\n\t"
		"1:"
		: "=a"(r) : "a"(number), "D"(arg1), "S"(arg2), "d"(arg3)
		: "rcx", "r11", "memory");
	return r;
}

/* ---- minimal libc string/memory ---- */

void *
memcpy(void *dst, const void *src, size_t n)
{
	unsigned char *d = (unsigned char *)dst;
	const unsigned char *s = (const unsigned char *)src;
	while (n--) {
		*d++ = *s++;
	}
	return dst;
}

void *
memmove(void *dst, const void *src, size_t n)
{
	unsigned char *d = (unsigned char *)dst;
	const unsigned char *s = (const unsigned char *)src;
	if (d < s) {
		while (n--) {
			*d++ = *s++;
		}
	} else if (d > s) {
		d += n;
		s += n;
		while (n--) {
			*--d = *--s;
		}
	}
	return dst;
}

void *
memset(void *dst, int c, size_t n)
{
	unsigned char *d = (unsigned char *)dst;
	while (n--) {
		*d++ = (unsigned char)c;
	}
	return dst;
}

int
memcmp(const void *a, const void *b, size_t n)
{
	const unsigned char *pa = (const unsigned char *)a;
	const unsigned char *pb = (const unsigned char *)b;
	while (n--) {
		if (*pa != *pb) {
			return (int)*pa - (int)*pb;
		}
		pa++;
		pb++;
	}
	return 0;
}

size_t
strlen(const char *s)
{
	const char *p = s;
	while (*p) {
		p++;
	}
	return (size_t)(p - s);
}

/* ---- OS randomness (br_prng_seeder_system) ---- */

static uint64_t
rdtsc(void)
{
	uint32_t lo, hi;
	__asm__ volatile("rdtsc" : "=a"(lo), "=d"(hi));
	return ((uint64_t)hi << 32) | lo;
}

static int
seeder_system(const br_prng_class **ctx)
{
	unsigned char tmp[32];
	size_t got = 0;
	long fd;
	uint64_t t;

	fd = sys3(SYS_open, (long)"/dev/urandom", O_RDONLY, 0);
	if (fd >= 0) {
		while (got < sizeof tmp) {
			long r = sys3(SYS_read, fd, (long)(tmp + got), (long)(sizeof tmp - got));
			if (r <= 0) {
				break;
			}
			got += (size_t)r;
		}
		sys1(SYS_close, fd);
	}

	/* Fill any shortfall with RDTSC + a self-referential address. This is
	 * weak entropy but always available; sufficient given SHA-256 pinning. */
	t = rdtsc();
	while (got < sizeof tmp) {
		size_t u;
		uint64_t x = t ^ (uint64_t)(uintptr_t)&tmp ^ (uint64_t)(uintptr_t)ctx;
		for (u = 0; u < 8 && got < sizeof tmp; u++, got++) {
			tmp[got] = (unsigned char)(x >> (8 * u));
		}
		t = rdtsc();
	}

	(*ctx)->update(ctx, tmp, sizeof tmp);
	return 1;
}

br_prng_seeder
br_prng_seeder_system(const char **name)
{
	if (name != NULL) {
		*name = "urandom";
	}
	return &seeder_system;
}
