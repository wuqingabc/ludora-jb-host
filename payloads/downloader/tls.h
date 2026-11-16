#ifndef LUDORA_DL_TLS_H
#define LUDORA_DL_TLS_H

#include "bearssl.h"

/*
 * Skip-verification X.509 engine.
 *
 * Cloudflare R2 serves an ECDSA leaf certificate that rotates roughly every
 * 3 months, so pinning its public key is fragile. This engine extracts the
 * leaf's public key *dynamically* with a standard X.509 decoder and never
 * validates the certificate chain. Integrity is enforced independently by the
 * pinned SHA-256 of the package, so TLS is transport privacy/obfuscation, not
 * the security boundary.
 */
typedef struct {
	const br_x509_class *vtable;
	br_x509_decoder_context dec;
	br_x509_pkey pkey;
	int have_key;
} ludora_x509_noverify;

void ludora_x509_noverify_init(ludora_x509_noverify *xc);

/*
 * Minimal TLS 1.2 client profile: ECDHE-ECDSA only (matches the Cloudflare
 * ECDSA leaf), AES-128/256-GCM. No RSA/DES/CCM/CBC/ChaCha is wired in, which
 * keeps the freestanding payload small.
 */
void ludora_tls_client_init(br_ssl_client_context *cc, ludora_x509_noverify *xc);

#endif /* LUDORA_DL_TLS_H */
