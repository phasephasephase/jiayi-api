import Link from 'next/link';

import globeASCII from './assets/ascii/globe';
import { siteConfig } from '~/config/site';

export default function Home() {
  return (
    <div className='w-min'>
      <pre className='my-4'>{globeASCII}</pre>
      <p className='text-center w-full'>
        <a href={siteConfig.mainSiteUrl} className='text-pure underline'>
          jiayi software
        </a>{' '}
        &#x2022;{' '}
        <Link href='/docs' className='text-pure underline'>
          api docs
        </Link>
      </p>
    </div>
  );
}
