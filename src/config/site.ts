export const siteConfig = {
  domain: 'phased.tech',
  subdomain: 'jiayi-api',
  protocol: 'https',
  get baseUrl() {
    return `${this.protocol}://${this.subdomain}.${this.domain}`;
  },
  get mainSiteUrl() {
    return `${this.protocol}://jiayi.${this.domain}`;
  },
  get docsUrl() {
    return `${this.baseUrl}/docs`;
  },
  get title() {
    return `${this.subdomain}.${this.domain}`;
  },
  get description() {
    return 'Jiayi API Documentation';
  },
  get openGraph() {
    return {
      title: this.title,
      description: 'API routes for Jiayi',
      url: this.docsUrl,
      type: 'website' as const,
      images: 'https://cdn.discordapp.com/icons/1076188174407176212/c42955c501c842e06248b294a81bd0ab.png',
    };
  },
};
