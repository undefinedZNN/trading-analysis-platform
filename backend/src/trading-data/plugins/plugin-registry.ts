import { ImportPlugin } from './import-plugin.interface';

class PluginRegistry {
  private readonly plugins: ImportPlugin[] = [];

  register(plugin: ImportPlugin) {
    if (!this.plugins.some((item) => item.name === plugin.name)) {
      this.plugins.push(plugin);
    }
  }

  findByFormat(format: string): ImportPlugin | undefined {
    return this.plugins.find((plugin) => plugin.supports(format));
  }

  getAll(): ImportPlugin[] {
    return [...this.plugins];
  }
}

export const pluginRegistry = new PluginRegistry();
