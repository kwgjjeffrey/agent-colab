# Colab regression environment adapter

This adapter is read-only and uses the existing Colab Python Local API transport for discovery and authentication. Do not copy bearer credentials into environment profiles or output. Bind IDs or unique names explicitly; execution receives fixed resources. Current Channel preflight supports read access only; unsupported permissions and resource kinds block. Runtime availability checks inspect actual registered Codex runtimes, but do not prove provider execution. Do not disconnect, reconnect, start or fabricate Agents from preflight.
