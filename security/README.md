# Runtime zlib update

The Debian 13 base currently includes zlib `1:1.3.dfsg+really1.3.1-1+b1`.
Debian confirms fixes for [CVE-2026-76844](https://security-tracker.debian.org/tracker/CVE-2026-76844)
and [CVE-2026-85091](https://security-tracker.debian.org/tracker/CVE-2026-85091)
in `1:1.3.dfsg+really1.3.2-4`, while its Debian 13 feed still has no fixed version.

The image extracts that exact official package from a frozen Debian snapshot.
APT verifies the signed repository and package checksums. Only zlib is replaced;
the old shared library is removed. A scratch final stage copies the completed
filesystem so the vulnerable file is absent from every final image layer. The
real Debian control metadata and checksums are retained for package inventory.

The OpenVEX document records the two fixes for **only that exact package
version**. It does not suppress old versions, other packages or future CVEs.
Smoke tests check installed version, binary checksums, absence of the old
library and native image processing. HIGH/CRITICAL findings still fail the scan.

Remove this temporary overlay and its VEX document when a pinned Debian 13 base
contains the same fixes. A manual image workflow on a feature branch now builds,
smoke-tests and scans the candidate without pushing production tags; publication
is limited to `main`.
