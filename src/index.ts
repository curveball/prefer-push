import { Context, Middleware, Application } from '@curveball/core';
import httpLinkHeader from 'http-link-header';

export default (app: Application): Middleware => {

  return async (ctx: Context, next: () => void) => {

    const preferPushHeader = ctx.request.headers.get('Prefer-Push');

    if (!preferPushHeader) {
      // No Prefer-Push header, lets do an early return
      return next();
    }

    const pushRels = preferPushHeader.split(',').map( item => item.trim());

    // Let all the regular middlewares execute
    await next();

    const linkHeader = ctx.response.headers.get('Link');

    // No Link header? Skip.
    if (!linkHeader) {
      return;
    }

    // Get a list of links from response headers.
    const links = httpLinkHeader.parse(linkHeader);

    // Get all hrefs for links that need to get pushed.
    const hrefs: string[] = [];

    for (const pushRel of pushRels) {

      for (const link of <any>links.rel(pushRel)) {

        // We're only interested if the href is relative
        if (!/^\/[^\/]/.test(link.uri)) {
          console.log('Pushing %s', link.uri);
          hrefs.push(link.uri);
        }

      }

    }

    const pushPromises = [];

    for(const href of hrefs) {

      pushPromises.push(ctx.push( pushCtx => {

        pushCtx.request.path = href;
        app.handle(pushCtx);

      }));

    }

    await Promise.all(pushPromises);

  };

};
