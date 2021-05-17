const minify = require("html-minifier").minify;
const fs = require("fs-extra");
const path = require("path");

const projectRoot = path.join(__dirname,"..")
const dist = path.join(projectRoot,"dist");
const src = path.join(projectRoot,"src");
const assets = [
    "flow-debugger.html",
    "locales"
];

(async function() {
    await fs.mkdir(dist,{recursive: true});
    for (let i=0; i<assets.length; i++) {
        if (/\.html/.test(assets[i])) {
            const content = await fs.readFile(path.join(src,assets[i]),"utf-8")
            await fs.writeFile(path.join(dist,assets[i]), minify(content, {minifyCSS: true, minifyJS: true}))
        } else {
            await fs.mkdir(path.join(dist,assets[i]), {recursive: true});
            await fs.copy(path.join(src,assets[i]),path.join(dist,assets[i]))
        }
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
