import { createClient } from "@supabase/supabase-js"
import { createHmac, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}))
const URL=env.NEXT_PUBLIC_SUPABASE_URL, ANON=env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SECRET=env.SUPABASE_JWT_SECRET, TENANT=env.NEXT_PUBLIC_EMP_PROPRIETARIA_ID
function jwt(t){const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const n=Math.floor(Date.now()/1e3);const h=b64({alg:"HS256",typ:"JWT"}),b=b64({role:"authenticated",aud:"authenticated",sub:randomUUID(),tenant_id:t,iat:n,exp:n+120});return`${h}.${b}.${createHmac("sha256",SECRET).update(`${h}.${b}`).digest("base64url")}`}
const A=createClient(URL,ANON,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:`Bearer ${jwt(TENANT)}`}}})
const svc=createClient(URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}})
const tabelas=readFileSync("_all.txt","utf8").split("\n").filter(Boolean)
const quebradas=[], vazias=[]
for(const t of tabelas){
  const s=await svc.from(t).select("*",{head:true,count:"exact"})
  if(s.error) continue // não é tabela (bucket etc.)
  if(s.count===0){vazias.push(t);continue}
  const a=await A.from(t).select("*",{head:true,count:"exact"})
  if(!a.error && a.count===0) quebradas.push(`${t} (svc=${s.count})`)
}
console.log("QUEBRADAS (svc>0, tenant=0 → deny-all):")
console.log(quebradas.length?quebradas.join("\n"):"  (nenhuma)")
console.log(`\nvazias (0 linhas, indeterminado — cobertas se emp/por-pai): ${vazias.length}`)
