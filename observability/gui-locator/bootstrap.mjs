import {mountLocator} from '/locator/runtime.mjs';

// This adapter only supplies Colab's diagnostic activation and live registry endpoint.
const config=JSON.parse(document.querySelector('#trace-locator-config')?.textContent||'{}');
mountLocator({
 enabled:true,
 allowedOrigins:[location.origin,config.catalogOrigin].filter(Boolean),
 getOperations:async()=>{
  const response=await fetch('/locator/entries.json');
  if(!response.ok)throw Error('Registry unavailable');
  return response.json();
 }
});
