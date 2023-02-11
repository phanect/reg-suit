# reg-publish-cloudflare-pages-plugin

reg-suit plugin to fetch and publish snapshot images to Cloudflare Pages.

## Install

```sh
npm i reg-publish-cloudflare-pages-plugin -D
reg-suit prepare -p publish-cloudflare-pages
```

## Cloudflare Token

This plugin requires Cloudflare account ID and API token to access Cloudflare Pages.

Create an API token on [Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens)

**TODO write which permission is required for the API token**

Then set environment variable to pass it to reg-suit.

```sh
export CLOUDFLARE_API_TOKEN=<your-cloudflare-api-token>
```

## Configure

```ts
{
  project: string;
}
```

- `project` - _Required_ - The project name for Cloudflare Pages to publish the snapshot images to. Your snapshot will be published as <key>.<project>.pages.dev
