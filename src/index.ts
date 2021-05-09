import { Application, Context, Middleware } from '@curveball/core';
import httpLinkHeader from 'http-link-header';

const copyHeaders = [
  'Origin',
];

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

    const hrefs = getLinksForRequest(ctx, pushRels).filter( href => {
      return !/^\/[^/]/.test(href);
    });

    const pushPromises = [];

    for (const href of hrefs) {

      pushPromises.push(ctx.push( pushCtx => {

        pushCtx.request.path = href;
        for (const headerName of copyHeaders) {
          if (ctx.request.headers.has(headerName)) {
            pushCtx.request.headers.set(headerName, ctx.request.headers.get(headerName)!);
          }
        }
        return app.handle(pushCtx);

      }));

    }

    await Promise.all(pushPromises);

  };

};

const getLinksForRequest = (ctx: Context, rels: string[]): string[] => {

  const result = new Set<string>();

  const linkHeader = ctx.response.headers.get('Link');

  // No Link header? Skip.
  if (linkHeader) {
    const httpLinks = httpLinkHeader.parse(linkHeader);
    for (const link of httpLinks.refs) {
      if (rels.includes(link.rel)) {
        result.add(link.uri);
      }
    }

  }

  if (ctx.response.body._links !== undefined) {
    // Assume it's HAL
    for (const rel of rels) {
      if (ctx.response.body._links[rel] !== undefined) {
        if (Array.isArray(ctx.response.body._links[rel])) {
          for (const halLink of ctx.response.body._links[rel]) {
            result.add(halLink.href);
          }
        } else {
          result.add(ctx.response.body._links[rel].href);
        }
      }
    }

  }

  return Array.from(result);

};
