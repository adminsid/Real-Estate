# Private native media benchmark

This is a bounded cloud experiment replacing paid transformations with native
imgproxy and FFmpeg. It does not enable inventory processing or public release.

Owner page: https://preview-search.primeamericany.com/ops/media-processing

The preview verifies the owner's signed Cloudflare Access identity on the page,
actions and result files. POST requires the preview Origin. The processor has no
route, workers.dev address, preview URL, cron or queue consumer. Only its private
service binding can invoke it. Public search has no processor binding.

## Controls

- One `basic` container: 0.25 vCPU, 1 GiB RAM, 4 GB disk; maximum one instance.
- Four attempts for the lifetime of `owner-benchmark-v1`; failed attempts count.
  Redeploys, retries and month changes do not reset the ledger.
- Three-minute persisted deadline, explicit stop on completion, one-second
  inactivity setting, and an independent three-minute process watchdog.
- A deadline or Durable Object interruption permanently pauses this generation.
  Cleanup retries preserve the pause, delete partial deterministic output keys,
  and stop repeating after successful cleanup. No automatic retry of processing.
- Fixed profiles only. Retained JPEG, PNG or WebP originals are limited to 12 MiB
  and 30 megapixels. Each output is limited to 5 MiB; total outputs to 10 MiB.
- No outbound container Internet, arbitrary source URL, shell input, upload
  endpoint, public transform endpoint, source credential or MLS hotlink.
- Image input is checked against the canonical current listing/media manifest
  before reading, after reading, before persistence and on every result read.
  A withdrawal removes access even if bytes remain in R2.
- Existing Images cap stays zero. The old variant queue stays detached. Stream
  stays unused. No account subscription is activated by these configurations.

## What runs

The image test takes one currently eligible photo already in private R2 and makes
160px/quality84, 720px/quality86 and 1600px/quality92 WebP files. It fits within the
width without enlarging or cropping. Originals remain unchanged. Saved native
outputs use `native-benchmark/v1/{job-id}/{profile}`, separate from existing
consumer derivatives; they do not replace production images during this test.

The video test generates a three-second 640×360 test pattern in Cloudflare, then
makes a WebP poster, 480px MP4 preview and HLS playlist/segment. It exercises
FFmpeg without downloading third-party tours or assuming MLS video reuse rights.
Owned video upload, long-video transcoding, adaptive bitrate ladders and public
video delivery are outside this benchmark.

Completed actions return their existing ledger result without starting the
container again. Outputs remain in private R2 after the container stops. R2,
not CDN eviction behavior, provides reuse. The owner page shows saved sizes and
elapsed time and allows viewing image and MP4 results.

## Cost interpretation

At published overage prices, provisioned `basic` resources for all four full
three-minute reservations give an estimated compute amount of $0.0056016 before
account allowances. This is not a bill or a cap on the whole Cloudflare account.
It excludes Workers, Durable Objects, R2, registry/build usage and tax; source
synchronization and other applications continue their own usage. Successful
processing measurements must be collected before expanding the allowance.

Do not change the budget identity, reset its ledger, enable inventory conversion
or reattach the old Images queue merely because this test succeeds. Broader
operation needs an explicitly sized batch, measured quality, throughput and
cost, owned-video authorization, retry policy and a separate operational budget.

## Build and deploy

From the search worktree:

```sh
npm test
npm run typecheck
npm run build
npm run search:typecheck
npm run search:typecheck:production
npm run search:build:production
npx tsc --noEmit -p workers/media-processor/tsconfig.json
npx wrangler deploy --config workers/media-processor/wrangler.jsonc
npm run search:deploy:staging
```

Docker Desktop is needed only to build/push the Linux deployment image. Actual
photo and video processing runs in Cloudflare Containers. The imgproxy base is
version- and digest-pinned; Ubuntu packages are recorded in the built image. The
FFmpeg distribution includes GPL components (`libx264`); preserve distribution
notices and corresponding-source obligations if distributing the image.

## Primary references

- [Containers API](https://developers.cloudflare.com/containers/api/durable-object-container/)
- [Containers limits](https://developers.cloudflare.com/containers/platform/limits/)
- [Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/)
- [Workers request framing](https://developers.cloudflare.com/workers/runtime-apis/request/#set-the-content-length-header)
- [imgproxy local files](https://docs.imgproxy.net/3.30.x/image_sources/local_files)
- [imgproxy configuration](https://docs.imgproxy.net/3.31.x/configuration/options)
- [FFmpeg HLS muxer](https://ffmpeg.org/ffmpeg-formats.html#hls-2)
