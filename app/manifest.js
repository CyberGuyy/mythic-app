export default function manifest() {
  return {
    name: 'Mythic',
    short_name: 'Mythic',
    description: 'Your tasks, habits and day on one page.',
    start_url: '/dash',
    display: 'standalone',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    icons: [{ src: '/favicon.ico', sizes: '48x48', type: 'image/x-icon' }],
  };
}
