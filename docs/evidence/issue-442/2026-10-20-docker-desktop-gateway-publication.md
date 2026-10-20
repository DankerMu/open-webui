# Gateway-IP publication on Docker Desktop — observation record

## Boundary

This record covers the engine qualification owned by [#442](https://github.com/DankerMu/open-webui/issues/442) on one host: this macOS machine's Docker Desktop. It separates what the engine was observed to do from the explanation offered for it. A native Linux engine was not available in this round; its row below is untested, and #442's acceptance criteria for a supported profile (assigned ports on the gateway plus a real BrowserViewer download) stay open.

#197's acceptance criteria are unchanged by this record, and its separate 14-test, zero-failure production-profile integration result on this same engine stays valid evidence: those tests exercise tool calls and workspace files, not the published browser or terminal ports.

The probe image is `alpine:3.20` for the host architecture (`linux/arm64`); the issue's original observation came from the `linux/amd64` sandbox image. The publication request shape is the same in both cases.

## Engine profile

| Field                   | Value                                                   |
| ----------------------- | ------------------------------------------------------- |
| Engine                  | Docker Desktop, Engine `29.1.3`, API `1.52`             |
| Engine OS/arch          | `linux/arm64` (`aarch64`), kernel `6.12.54-linuxkit`    |
| Storage                 | `overlayfs`, `driver-type=io.containerd.snapshotter.v1` |
| Host                    | Darwin 25.6.0 arm64 (macOS)                             |
| Probe network           | user bridge `10.242.0.0/24`, gateway `10.242.0.1`       |
| Probe image             | `alpine:3.20` (`linux/arm64`)                           |
| Native Linux engine row | untested in this round                                  |

## Probe commands

Run on 2026-10-20. Each container is started with one publication spec, inspected after one second, then removed; the network is removed at the end.

```bash
docker network create --subnet 10.242.0.0/24 --gateway 10.242.0.1 ocu442probe
for spec in "10.242.0.1::9222" "10.242.0.1:0:9222" "10.242.0.1:39222:9222" "127.0.0.1::9222" "0.0.0.0::9222"; do
  if CID=$(docker run -d --rm --network ocu442probe -p "$spec" alpine:3.20 sleep 30 2>err.txt); then
    sleep 1
    echo "spec=$spec exit=0 ports=$(docker inspect $CID --format '{{json .NetworkSettings.Ports}}') bindings=$(docker inspect $CID --format '{{json .HostConfig.PortBindings}}')"
    docker rm -f $CID >/dev/null
  else
    echo "spec=$spec exit=$? error=$(grep -o 'Error response from daemon.*' err.txt | head -1)"
  fi
done
docker network rm ocu442probe
```

## Observations (verbatim)

```
engine: 29.1.3 linux/arm64 api=1.52
platform: Docker Desktop | linux/aarch64 | kernel 6.12.54-linuxkit | driver overlayfs | driver-type=io.containerd.snapshotter.v1
host: Darwin 25.6.0 arm64
spec=10.242.0.1::9222 exit=0 ports={"9222/tcp":[]} bindings={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":""}]}
spec=10.242.0.1:0:9222 exit=0 ports={"9222/tcp":[]} bindings={"9222/tcp":[{"HostIp":"10.242.0.1","HostPort":"0"}]}
spec=10.242.0.1:39222:9222 exit=125 error=Error response from daemon: ports are not available: exposing port TCP 10.242.0.1:39222 -> 127.0.0.1:0: listen tcp4 10.242.0.1:39222: bind: can't assign requested address
spec=127.0.0.1::9222 exit=0 ports={"9222/tcp":[{"HostIp":"127.0.0.1","HostPort":"62490"}]} bindings={"9222/tcp":[{"HostIp":"127.0.0.1","HostPort":""}]}
spec=0.0.0.0::9222 exit=0 ports={"9222/tcp":[{"HostIp":"0.0.0.0","HostPort":"62534"}]} bindings={"9222/tcp":[{"HostIp":"0.0.0.0","HostPort":""}]}
```

| Publication spec       | Accepted | Assigned host port | Immutable binding                   |
| ---------------------- | -------- | ------------------ | ----------------------------------- |
| gateway, dynamic port  | yes      | none               | `HostIp=10.242.0.1`, `HostPort=""`  |
| gateway, port `0`      | yes      | none               | `HostIp=10.242.0.1`, `HostPort="0"` |
| gateway, explicit port | no (125) | n/a                | daemon error, see above             |
| loopback, dynamic port | yes      | `62490`            | `HostIp=127.0.0.1`                  |
| wildcard, dynamic port | yes      | `62534`            | `HostIp=0.0.0.0`                    |
| native Linux, any spec | untested | untested           | untested                            |

The two gateway-dynamic rows reproduce the issue's observation: the daemon accepts the request, the container runs, and `NetworkSettings.Ports` stays empty while the immutable binding carries the gateway. The loopback and wildcard controls isolate the difference to the gateway address.

## Explanation (not an established root cause)

The explicit-port error says the forwarder tried to listen on `10.242.0.1:39222` on the host and the address could not be assigned. That is consistent with Docker Desktop forwarding published ports onto the macOS host, which does not own the Linux VM's bridge gateway address. The dynamic-port case fails silently rather than with that error, so this explanation is inferred from the explicit-port behaviour, not confirmed from the daemon.

## OCU behaviour after the #442 slice

OCU does not change the publication request. On this profile a sandbox starts and serves tool calls, and the service lookup raises a typed capability fault (`gateway_publication_unassigned`, status 503) that the browser and terminal status routes return as `active: false` with `reason` and `detail`, and the CDP JSON routes return as 503, instead of reporting the running sandbox as absent. Specification: `openspec/specs/ocu-network-isolation/spec.md`, requirement "Published service addressing without compose fallback".

## Qualification test record

The opt-in test `tests/orchestrator/test_engine_gateway_publication.py` in `open-computer-use` publishes both sandbox service ports on a temporary bridge gateway through the production publication shape and resolves them through the production lookup. On a native Linux engine the same command is the AC1 instrument:

```bash
OCU_ENGINE_PROBE=1 OCU_ENGINE_PROBE_OUT=/tmp/engine-gateway-publication.json \
  python -m pytest tests/orchestrator/test_engine_gateway_publication.py --import-mode=importlib -p no:warnings
```

### Record from this machine (2026-10-20, OCU PR 157)

Run with `OCU_ENGINE_PROBE=1`: 1 passed; both ports unassigned. `host.platform` reports the macOS product version (`macOS-26.6.2`), which is the same system as the Darwin 25.6.0 kernel named above. Afterwards `docker ps -a --filter label=managed-by=ocu-engine-probe` and `docker network ls --filter name=ocu-engine-probe` were empty.

```json
{
	"bindings": {
		"7681/tcp": [
			{
				"HostIp": "10.242.0.1",
				"HostPort": ""
			}
		],
		"9222/tcp": [
			{
				"HostIp": "10.242.0.1",
				"HostPort": ""
			}
		]
	},
	"engine": {
		"api_version": "1.52",
		"arch": "arm64",
		"os": "linux",
		"version": "29.1.3"
	},
	"gateway": "10.242.0.1",
	"host": {
		"machine": "arm64",
		"platform": "macOS-26.6.2-arm64-arm-64bit-Mach-O"
	},
	"image": {
		"platform": "linux/arm64",
		"reference": "alpine:3.20"
	},
	"platform": {
		"architecture": "aarch64",
		"driver_status": [["driver-type", "io.containerd.snapshotter.v1"]],
		"kernel": "6.12.54-linuxkit",
		"operating_system": "Docker Desktop",
		"os_type": "linux",
		"storage_driver": "overlayfs"
	},
	"ports": {
		"7681/tcp": [],
		"9222/tcp": []
	},
	"verdict": {
		"7681": "unassigned",
		"9222": "unassigned"
	}
}
```

## Next step

Run the qualification test on a native Linux engine and attach its record to #442. If both ports are assigned there, complete AC2 (BrowserViewer connects and a real download lands in the workspace) on that engine; #197's BrowserViewer/download item needs that engine regardless of this slice.
