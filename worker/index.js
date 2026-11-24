const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.protocol==="http:"){url.protocol="https:";return Response.redirect(url.toString(),301);}
    if(url.pathname.startsWith("/api/")){
      if(request.method!=="POST")return json(405,{error:"Use POST."});
      if(request.headers.get("origin")!==url.origin)return json(403,{error:"This request must come from this site."});
      if(!env.BETASOUNDLABS)return json(503,{error:"The BetaSoundLabs service is not connected yet."});
      const headers=new Headers(request.headers);
      headers.set("x-betarox-client-ip",request.headers.get("cf-connecting-ip")||"unknown");
      return env.BETASOUNDLABS.fetch(new Request(request,{headers}));
    }
    const isLab = /^\/(?:editor\/player|spectral-lab|score)(?:\/|$)/.test(url.pathname);
    if (isLab && request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Use GET or HEAD.", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    if (isLab && !env.BETASOUNDLABS && !env.BETASOUNDLABS_SPECTRAL_PREVIEW_URL) {
      return json(503, { error: "The BetaSoundLabs service is not connected yet." });
    }
    let asset;
    if (isLab && env.BETASOUNDLABS_SPECTRAL_PREVIEW_URL) {
      // Worker Previews cannot bind to another Worker's matching Preview, so
      // route this integration branch through the Lab Preview over HTTPS.
      // The editor's /editor/player path maps to the Lab site's /spectral-lab page.
      // Production has no such variable and continues to use the service binding.
      const previewPath = url.pathname.replace(/^\/editor\/player(?=\/|$)/, "/spectral-lab");
      const previewUrl = new URL(previewPath + url.search, env.BETASOUNDLABS_SPECTRAL_PREVIEW_URL);
      asset = await fetch(new Request(previewUrl, request));
    } else {
      const assetService = isLab ? env.BETASOUNDLABS : env.ASSETS;
      asset = await assetService.fetch(request);
    }
    const response=new Response(asset.body,asset);
    response.headers.set("Strict-Transport-Security","max-age=31536000");
    return response;
  }
};
