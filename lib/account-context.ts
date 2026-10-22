// This is a stale-tab guard, never an authentication source or SQL user selector.
export function requireAccountContext(request:Request,authenticatedUserId:string){
 const expected=request.headers.get('x-study-user-id')??new URL(request.url).searchParams.get('account');
 if(!expected)return Response.json({error:'需要账号上下文。请保留未保存内容，并完整刷新页面后重试。',code:'account-context-required'},{status:428,headers:{'Cache-Control':'no-store'}});
 if(expected!==authenticatedUserId)return Response.json({error:'登录账号已在另一页面改变。原账号草稿已保留，本次操作未执行。请重新载入当前账号；需要旧草稿时请重新登录原账号。',code:'account-context'},{status:409,headers:{'Cache-Control':'no-store'}});
 return null;
}
