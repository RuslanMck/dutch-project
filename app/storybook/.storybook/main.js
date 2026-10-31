/** @type { import('@storybook/html-vite').StorybookConfig } */
export default {
  framework: { name: '@storybook/html-vite', options: {} },
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.js'],
  addons: ['@storybook/addon-essentials'],
  // The app's self-hosted fonts, served at /fonts like in the app.
  staticDirs: [{ from: '../../public/fonts', to: '/fonts' }],
  core: { disableTelemetry: true },
};
