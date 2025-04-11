const esbuild = require("esbuild");
const fs = require('fs');
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
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * @type {import('esbuild').Plugin}
 */
const copyCodiconsPlugin = {
	name: 'copy-codicons-plugin',
	setup(build) {
		build.onEnd(() => {
			// Ensure dist directory exists
			if (!fs.existsSync('dist')) {
				fs.mkdirSync('dist', { recursive: true });
			}
			
			// Copy Codicons font file
			const fontSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');
			const fontDest = path.join(__dirname, 'dist', 'codicon.ttf');
			
			// Copy CSS file
			const cssSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
			const cssDest = path.join(__dirname, 'dist', 'codicon.css');
			
			try {
				fs.copyFileSync(fontSrc, fontDest);
				console.log('✓ Copied codicon.ttf to dist folder');
				
				fs.copyFileSync(cssSrc, cssDest);
				console.log('✓ Copied codicon.css to dist folder');
			} catch (error) {
				console.error('✘ Error copying Codicons files:', error);
			}
		});
	}
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
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
			copyCodiconsPlugin,
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
