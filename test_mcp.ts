import { PluginRegistry } from './src/core/pluginRegistry';

(async () => {
  try {
    await PluginRegistry.init();
    console.log('Navigating...');
    await PluginRegistry.routeAndExecute('browser__navigate', { url: 'https://example.com' }, 'test-user-123', 'api');
    
    console.log('Evaluating basic string...');
    const res1 = await PluginRegistry.routeAndExecute('browser__evaluate', { expression: `'hello'` }, 'test-user-123', 'api');
    console.log('res1:', res1);

    console.log('Evaluating IIFE...');
    const res2 = await PluginRegistry.routeAndExecute('browser__evaluate', { expression: `(() => { return 'hello'; })()` }, 'test-user-123', 'api');
    console.log('res2:', res2);

    console.log('Evaluating page_content...');
    const res3 = await PluginRegistry.routeAndExecute('browser__page_content', {}, 'test-user-123', 'api');
    console.log('res3:', res3);
    
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
})();
