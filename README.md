# next-package-check

NextJS plugin to check for outdated packages while starting up. Faster than `npm outdated` and also notifies about linked packages.

## Usage

File: `next.config.js`

```js
  const { withPackageCheck } = require('with-package-check')

  const nextConfig = withPackageCheck({
    "your next config": "here",
  })

  module.exports = nextConfig
```