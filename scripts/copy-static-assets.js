const minify = require("html-minifier").minify;
const fs = require("fs").promises;
const path = require("path");

const projectRoot = path.join(__dirname,"..")
const dist = path.join(projectRoot,"dist");
const src = path.join(projectRoot,"src");
const assets = [
    "flow-debugger.html"
];

(async function() {
    await fs.mkdir(dist,{recursive: true});
    for (let i=0; i<assets.length; i++) {
        const content = await fs.readFile(path.join(src,assets[i]),"utf-8")
        await fs.writeFile(path.join(dist,assets[i]), minify(content, {minifyCSS: true, minifyJS: true}))
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
