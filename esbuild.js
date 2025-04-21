const esbuild = require("esbuild");
const fs = require('fs-extra');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const copyAssetsPlugin = {
	name: 'copy-assets-plugin',
	setup(build) {
		build.onEnd(async () => {
			const distDir = path.join(__dirname, 'dist');
			if (!fs.existsSync(distDir)) {
				fs.mkdirSync(distDir, { recursive: true });
			}

			try {
				const libsToCopy = [
					{ src: path.join(__dirname, 'node_modules', 'marked', 'marked.min.js'), dest: path.join(distDir, 'libs', 'marked.min.js') },
					{ src: path.join(__dirname, 'node_modules', 'dompurify', 'dist', 'purify.min.js'), dest: path.join(distDir, 'libs', 'purify.min.js') }
				];
				fs.ensureDirSync(path.join(distDir, 'libs'));

				libsToCopy.forEach(lib => {
					fs.copyFileSync(lib.src, lib.dest);
					console.log(`[CopyAssetsPlugin] Copied library ${path.basename(lib.src)} to dist/libs.`);
				});
			} catch (error) {
				console.error('✘ Error copying JS libraries:', error);
			}

			// --- Copy Codicons ---
			try {
				const fontSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');
				const fontDest = path.join(distDir, 'codicon.ttf');
				const cssSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
				const cssDest = path.join(distDir, 'codicon.css');
				fs.copyFileSync(fontSrc, fontDest);
				fs.copyFileSync(cssSrc, cssDest);
				console.log('[CopyAssetsPlugin] Copied Codicons files.');
			} catch (error) {
				console.error('✘ Error copying Codicons files:', error);
			}

			// --- Copy Webview Assets (HTML, CSS, JS) ---
			try {
				const assetsSrcDir = path.join(__dirname, 'src', 'ui', 'html', 'partials');
				const assetsDestDir = path.join(distDir, 'ui', 'html', 'partials');

				await fs.copy(assetsSrcDir, assetsDestDir);
				console.log(`[CopyAssetsPlugin] Copied webview assets from ${assetsSrcDir} to ${assetsDestDir}.`);

			} catch (error) {
				console.error('✘ Error copying webview assets:', error);
			}
		});
	}
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
			copyAssetsPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});

