# V-RELEASE-DOWNLOAD-01

Runs the installed `colab-setup` in two separate processes against a local HTTP Range server. The
first transfer is forcibly truncated through all curl retries; the second invocation must retain the
persistent `.part`, request the remaining range, pass full size/SHA-256 verification, and finish with
`state=completed`.

```bash
python3 .trial/V-RELEASE-DOWNLOAD-01/resume_probe.py
```
