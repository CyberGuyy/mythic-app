// The root layout: the fonts every page uses (as CSS variables that
// app/dash/dash.css maps onto its tokens) and the Dash stylesheets, which
// onboarding and Connections share.
import { Geist, Instrument_Serif, Gloock, Geist_Mono, Shippori_Mincho, DotGothic16 } from 'next/font/google';
import './globals.css';
import './dash/dash.css';
import './dash/themes/yoru.css';
import './dash/widgets/index.css';
import './pages.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const instrumentSerif = Instrument_Serif({ variable: '--font-instrument-serif', subsets: ['latin'], weight: '400', style: ['normal', 'italic'] });
const gloock = Gloock({ weight: '400', subsets: ['latin'], variable: '--font-gloock' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
// Yoru's Japanese subtitles. Only the Latin subset is preloaded; the glyphs
// the page uses are fetched on demand.
const shippori = Shippori_Mincho({ weight: '500', subsets: ['latin'], variable: '--font-shippori', preload: false });
const dotGothic = DotGothic16({ weight: '400', subsets: ['latin'], variable: '--font-dotgothic', preload: false });

export const metadata = {
  title: 'Mythic',
  description: 'Your tasks, habits and day on one page.',
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  themeColor: '#0a0a0c',
  width: 'device-width',
  initialScale: 1,
};

const fonts = [geistSans, instrumentSerif, gloock, geistMono, shippori, dotGothic].map(font => font.variable).join(' ');

export default function RootLayout({ children }) {
  return <html lang="en" className={`${fonts} h-full antialiased`}>
    <body>{children}</body>
  </html>;
}
