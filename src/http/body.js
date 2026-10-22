import {ServiceError} from "../domain/serviceError.js";
export async function boundedRequest(request,limit=65536) {
  if(!request.body)return request;
  const reader=request.body.getReader(),parts=[];let size=0;
  try {
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>limit){await reader.cancel();throw new ServiceError("Request is too large.",{status:413,code:"REQUEST_TOO_LARGE"});}
      parts.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const headers=new Headers(request.headers);headers.delete("Content-Length");
  return new Request(request.url,{method:request.method,headers,body:bytes});
}
