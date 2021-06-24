const minify = require("html-minifier").minify;
const fs = require("fs-extra");
const path = require("path");


const projectRoot = path.join(__dirname,"..")
const resources = path.join(projectRoot,"resources");
const dist = path.join(projectRoot,"dist");
const src = path.join(projectRoot,"src");

const assets = {}
assets[dist] = [
    "flow-debugger.html",
    "locales"
]
assets[resources] = [
    "style.css"
]

async function copyStaticAssets(dist,assets) {
    await fs.mkdir(dist,{recursive: true});
    for (let i=0; i<assets.length; i++) {
        if (/\.html/.test(assets[i])) {
            const content = await fs.readFile(path.join(src,assets[i]),"utf-8")
            await fs.writeFile(path.join(dist,assets[i]), minify(content, {minifyCSS: true, minifyJS: true}))
        } else if (/\.js/.test(assets[i])) {
            await fs.copy(path.join(src,assets[i]),path.join(dist,assets[i]))
        } else if (/\.css/.test(assets[i])) {
            const rawCSS = await fs.readFile(path.join(src,assets[i]),"utf-8");
            const minifiedCSS = minify("<style>"+rawCSS+"</style>", {minifyCSS: true});
            const finalCSS = minifiedCSS.substring(7,minifiedCSS.length-8)
            await fs.writeFile(path.join(dist,assets[i]), finalCSS)
        } else {
            await fs.mkdir(path.join(dist,assets[i]), {recursive: true});
            await fs.copy(path.join(src,assets[i]),path.join(dist,assets[i]))
        }
    }
}



(async function() {
    const destinations = Object.keys(assets);
    for (let i=0, l=destinations.length; i<l; i++) {
        await copyStaticAssets(destinations[i],assets[destinations[i]]);
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
