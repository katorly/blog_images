# Image Repository for Katorly Blog

## Cloudflare CDN
```markdown
![](https://blog-img.katorly.com/)
```

## Purge Cloudflare cache 
Automatically purge Cloudflare cache for changed media files after pushing to `main`.

The following GitHub Actions secrets should be configured:

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_ZONE_ID` | Cloudflare Zone ID for `katorly.com`. |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with the `Cache Purge` permission. |
