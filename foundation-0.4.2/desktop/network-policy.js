export function allowedApplicationRequest(value){
 try{const u=new URL(value);return u.protocol==='studio:'&&u.host==='app'&&!u.username&&!u.password||['blob:','data:','devtools:'].includes(u.protocol)||u.protocol==='https:'&&u.hostname==='tile.openstreetmap.org'&&!u.port&&!u.username&&!u.password&&/^\/\d{1,2}\/\d+\/\d+\.png$/.test(u.pathname)&&!u.search;}catch{return false;}
}
