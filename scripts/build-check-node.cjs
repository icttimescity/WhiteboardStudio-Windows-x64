// Executed as a file: Windows PowerShell 5.1 must not parse embedded JS quotes.
const sharp = require('sharp');
sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}})
  .png().toBuffer()
  .then(buffer => {
    if(!buffer.length)throw new Error('Sharp returned empty output');
    console.log('Sharp runtime OK');
  })
  .catch(error => {console.error(error);process.exitCode=1;});
