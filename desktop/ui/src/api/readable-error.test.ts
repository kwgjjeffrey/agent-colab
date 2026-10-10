import {describe,it,expect} from 'vitest';
import {readableError} from './readable-error';
describe('Readable protocol failures',()=>{
 it('unwraps the nested non-retryable Catalog denial',()=>expect(readableError(new Error(JSON.stringify({error:JSON.stringify({code:'catalog_access_forbidden',message:'This action is not allowed',retryable:false})})))).toBe('This action is not allowed'));
 it('retains ordinary transport text and bounds it',()=>{expect(readableError(new TypeError('Failed to fetch'))).toBe('Failed to fetch');expect(readableError('x'.repeat(600))).toHaveLength(500);});
});
