import {nativeImage} from 'electron';
/** Read dimensions before decoding; SVG, GIF, remote URLs and other formats are rejected. */
export function imageDimensions(bytes:Buffer):{width:number;height:number}{
 if(bytes.length>8_000_000)throw Error('Select a PNG/JPEG no larger than 8 MB.');
 if(bytes.length>=33&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.subarray(12,16).toString()==='IHDR')return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){let i=2;while(i<bytes.length){if(bytes[i++]!==255)throw Error('Invalid JPEG header');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===0xda||marker===0xd9)break;if(marker===0x01||marker>=0xd0&&marker<=0xd8)continue;if(i+2>bytes.length)break;const size=bytes.readUInt16BE(i);if(size<2||i+size>bytes.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=8)return {width:bytes.readUInt16BE(i+5),height:bytes.readUInt16BE(i+3)};i+=size;}}
 throw Error('Only valid local PNG or JPEG images are supported.');
}
export function normalizeDrawingImage(bytes:Buffer){
 const size=imageDimensions(bytes);if(size.width<1||size.height<1||size.width>4096||size.height>4096)throw Error('Original image dimensions must be at most 4096 × 4096.');
 const original=nativeImage.createFromBuffer(bytes);if(original.isEmpty())throw Error('Image decoding failed.');const decoded=original.getSize();if(decoded.width>4096||decoded.height>4096)throw Error('Decoded image dimensions exceed the limit.');
 for(let bound=1024;bound>=16;bound=Math.floor(bound/2)){const scale=Math.min(1,bound/decoded.width,bound/decoded.height),image=original.resize({width:Math.max(1,Math.round(decoded.width*scale)),height:Math.max(1,Math.round(decoded.height*scale)),quality:'better'}),png=image.toPNG();if(png.length<=131072)return 'data:image/png;base64,'+png.toString('base64');}
 throw Error('Image remains too large after normalization.');
}
