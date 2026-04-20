'use client';

import { Metadata } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Next.js stupid bcs theres no way to get pathname on the server even though its in the request LOL
// export const metadata: Metadata = {
//   title: `API Docs - ${siteConfig.title}`,
//   description: `${siteConfig.description} docs`,
//   openGraph: {
//     title: `API Docs - ${siteConfig.title}`,
//     description: `API docs for Jiayi`,
//     url: siteConfig.docsUrl,
//     type: 'website',
//     images:
//       'https://cdn.discordapp.com/icons/1076188174407176212/c42955c501c842e06248b294a81bd0ab.png',
//   },
//   themeColor: '#FF0000',
//   twitter: {
//     card: 'summary_large_image',
//   },
// };

export const dynamicParams = false;

export default function Layout({ children }: { children: React.ReactNode }) {
  const paths = usePathname().split('/').slice(1);

  return (
    <div>
      <h1>
        {
          <div key={`paths-${paths.join('.')}`}>
            <Link href='/' className='text-pure underline'>
              home
            </Link>
            {paths.map((path, idx) => (
              <>
                {' '}
                &gt;{' '}
                <Link
                  key={`breadcrumb-${paths.join('.')}`}
                  href={`/${paths.slice(0, idx + 1).join('/')}`}
                  className='underline'
                >
                  {path}
                </Link>
              </>
            ))}
          </div>
        }
      </h1>

      {children}
    </div>
  );
}
