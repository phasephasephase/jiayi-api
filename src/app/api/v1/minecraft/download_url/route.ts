import { XMLParser } from 'fast-xml-parser';
import { NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { minify } from 'xml-minifier';
import { IAPIRouteMetaData } from '~/app/api/generateDocs';

import { ISchema, schema } from './validate';

const _downloadUrl =
  'https://fe3.delivery.mp.microsoft.com/ClientWebService/client.asmx/secured';

const _soap = 'http://www.w3.org/2003/05/soap-envelope';
const _addressing = 'http://www.w3.org/2005/08/addressing';
const _secext =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const _secutil =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const _updateService =
  'http://www.microsoft.com/SoftwareDistribution/Server/ClientWebService';
const _updateAuth =
  'http://schemas.microsoft.com/msus/2014/10/WindowsUpdateAuthorization';

export async function GET(req: NextRequest, res: NextApiResponse) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const urlSearchParams = new URLSearchParams(req.nextUrl.search);
  const params = Object.fromEntries(urlSearchParams.entries());
  const schemaResult = schema.safeParse(params);

  if (!schemaResult.success) {
    return NextResponse.json(
      {
        message: 'Invalid request',
        errors: schemaResult.error.issues,
      },
      {
        status: 400,
      }
    );
  }

  // Check for GDK support first
    const version = schemaResult.data.version || await getVersionFromUpdateId(
      schemaResult.data.update_id || 
      (await generateUpdateId(
        schemaResult.data.version || '',
        schemaResult.data.arch
      )) || ''
    );
    
    if (version) {
      const gdkData = await getGdkData(version);
      const hasGdk = gdkData.release.hasOwnProperty(version) || gdkData.preview.hasOwnProperty(version);
      
      // If GDK support is available, return GDK URLs directly
      if (hasGdk) {
        let gdkUrls: string[] = [];
        if (gdkData.release[version]) {
          gdkUrls = gdkData.release[version];
        } else if (gdkData.preview[version]) {
          gdkUrls = gdkData.preview[version];
        }
        
        if (gdkUrls.length > 0) {
          if (schemaResult.data.redirect) {
            return NextResponse.redirect(gdkUrls[0]);
          }
          return NextResponse.json(
            {
              success: true,
              url: gdkUrls[0], // Return first GDK URL
              gdk: true,
            },
            {
              status: 200,
            }
          );
        }
      }
    }

    // If no GDK support, use Microsoft update service
    const update_id =
      schemaResult.data.update_id ||
      (await generateUpdateId(
        schemaResult.data.version || '',
        schemaResult.data.arch
      ));
      
    try {
      if (!update_id) throw new Error('Version not found');

      const xml = GenerateXML(update_id || '');

      const data = await fetch(_downloadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/soap+xml',
        },
        body: minify(xml),
      });

      if (!data.ok) throw new Error('Failed to fetch');

      const parser = new XMLParser();
      let dataObject = parser.parse(await data.text());

      const result =
        dataObject['s:Envelope']['s:Body']['GetExtendedUpdateInfo2Response'][
          'GetExtendedUpdateInfo2Result'
        ];
      if (!result) throw new Error('No data found');

      const url = result['FileLocations']['FileLocation'].find((x: any) =>
        x['Url'].startsWith('http://tlu.dl.delivery.mp.microsoft.com/')
      );

      if (!url && !url['Url']) throw new Error('No url found');
      
      if (schemaResult.data.redirect) {
        return NextResponse.redirect(url['Url']);
      }
      return NextResponse.json(
        {
          success: true,
          url: url['Url'],
          gdk: false,
        },
        {
          status: 200,
        }
      );
  } catch (err: any) {
    console.error(err);

    // Try to get GDK info even if download failed
    let gdkInfo = { gdk: false };
    try {
      const version = schemaResult.data.version || await getVersionFromUpdateId(update_id || '');
      if (version) {
        const gdkData = await getGdkData(version);
        const hasGdk = gdkData.release.hasOwnProperty(version) || gdkData.preview.hasOwnProperty(version);
        gdkInfo = { gdk: hasGdk };
      }
    } catch (gdkErr) {
      console.error('Failed to get GDK info in error path:', gdkErr);
    }

    // Return this even if redirect
    return NextResponse.json(
      {
        success: false,
        error: err.message,
        ...gdkInfo,
      },
      {
        status: 500,
      }
    );
  }
}

function GenerateXML(update_id: string) {
  const now = new Date(Date.now());
  let fiveMinFuture = new Date(now);
  fiveMinFuture.setMinutes(fiveMinFuture.getMinutes() + 5);
  return `
<s:Envelope xmlns:a="${_addressing}" xmlns:s="${_soap}">
	<s:Header>
		<a:Action s:mustUnderstand="1">${_updateService}/GetExtendedUpdateInfo2</a:Action>
		<a:MessageID>urn:uuid:5754a03d-d8d5-489f-b24d-efc31b3fd32d</a:MessageID>
		<a:To s:mustUnderstand="1">${_downloadUrl}</a:To>
		<o:Security s:mustUnderstand="1" xmlns:o="${_secext}">
			<Timestamp xmlns="${_secutil}">
				<Created>${now.toISOString()}</Created>
				<Expires>${fiveMinFuture.toISOString()}</Expires>
			</Timestamp>
			<wuws:WindowsUpdateTicketsToken wsu:id="ClientMSA" xmlns:wsu="${_secutil}" xmlns:wuws="${_updateAuth}">
				<TicketType Name="MSA" Version="1.0" Policy="MBI_SSL" />
				<TicketType Name="AAD" Version="1.0" Policy="MBI_SSL"></TicketType>
			</wuws:WindowsUpdateTicketsToken>
		</o:Security>
	</s:Header>
	<s:Body>
		<GetExtendedUpdateInfo2 xmlns="${_updateService}">
			<updateIDs>
				<UpdateIdentity>
					<UpdateID>${update_id}</UpdateID>
					<RevisionNumber>1</RevisionNumber>
				</UpdateIdentity>
			</updateIDs>
			<infoTypes>
				<XmlUpdateFragmentType>FileUrl</XmlUpdateFragmentType>
			</infoTypes>
			<deviceAttributes>E:BranchReadinessLevel=CBB&amp;DchuNvidiaGrfxExists=1&amp;ProcessorIdentifier=Intel64%20Family%206%20Model%2063%20Stepping%202&amp;CurrentBranch=rs4_release&amp;DataVer_RS5=1942&amp;FlightRing=Retail&amp;AttrDataVer=57&amp;InstallLanguage=en-US&amp;DchuAmdGrfxExists=1&amp;OSUILocale=en-US&amp;InstallationType=Client&amp;FlightingBranchName=&amp;Version_RS5=10&amp;UpgEx_RS5=Green&amp;GStatus_RS5=2&amp;OSSkuId=48&amp;App=WU&amp;InstallDate=1529700913&amp;ProcessorManufacturer=GenuineIntel&amp;AppVer=10.0.17134.471&amp;OSArchitecture=AMD64&amp;UpdateManagementGroup=2&amp;IsDeviceRetailDemo=0&amp;HidOverGattReg=C%3A%5CWINDOWS%5CSystem32%5CDriverStore%5CFileRepository%5Chidbthle.inf_amd64_467f181075371c89%5CMicrosoft.Bluetooth.Profiles.HidOverGatt.dll&amp;IsFlightingEnabled=0&amp;DchuIntelGrfxExists=1&amp;TelemetryLevel=1&amp;DefaultUserRegion=244&amp;DeferFeatureUpdatePeriodInDays=365&amp;Bios=Unknown&amp;WuClientVer=10.0.17134.471&amp;PausedFeatureStatus=1&amp;Steam=URL%3Asteam%20protocol&amp;Free=8to16&amp;OSVersion=10.0.17134.472&amp;DeviceFamily=Windows.Desktop</deviceAttributes>
		</GetExtendedUpdateInfo2>
	</s:Body>
</s:Envelope>`;
}

type IW10Meta = Record<
  `${number}.${number}.${number}.${number}`,
  IW10VersionMeta
>;
interface IW10VersionMeta {
  Version: string;
  Archs: IW10Archs;
}
interface IW10Archs {
  x64?: IW10ArchData;
  x86?: IW10ArchData;
  arm?: IW10ArchData;
}
interface IW10ArchData {
  FileName: string;
  Hashes: IW10Hashes;
  UpdateIds: string[];
}

interface IW10Hashes {
  MD5: string;
  SHA256: string;
}

interface IGdkData {
  release: Record<string, string[]>;
  preview: Record<string, string[]>;
}

async function getGdkData(version: string): Promise<IGdkData> {
  try {
    // Fetch GDK metadata from GitHub repository
    const response = await fetch('https://raw.githubusercontent.com/MinecraftBedrockArchiver/GdkLinks/refs/heads/master/urls.min.json');
    if (response.ok) {
      const data = await response.json() as IGdkData;
      // Validate the structure before returning
      if (data && typeof data === 'object' && 'release' in data && 'preview' in data) {
        return data;
      }
    }
  } catch (error) {
    console.log('GDK metadata not available, using fallback data');
  }
  
  // Return empty GDK data if external fetch fails
  const emptyGdkData: IGdkData = {
    release: {},
    preview: {}
  };
  return emptyGdkData;
}

async function getVersionFromUpdateId(updateId: string): Promise<string | null> {
  try {
    const data = await fetch(
      'https://raw.githubusercontent.com/MinecraftBedrockArchiver/Metadata/master/w10_meta.json'
    ).then(res => res.json()) as IW10Meta;

    for (const [version, versionData] of Object.entries(data)) {
      for (const [arch, archData] of Object.entries(versionData.Archs)) {
        if (archData?.UpdateIds?.includes(updateId)) {
          return version;
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Failed to get version from update ID:', error);
    return null;
  }
}

async function generateUpdateId(version: string, arch: ISchema['arch']) {
  const data = (await fetch(
    'https://raw.githubusercontent.com/MinecraftBedrockArchiver/Metadata/master/w10_meta.json'
    // { next: { revalidate: 3 * 60 * 60 * 1000 } }
    // FIX: Revalidation doesn't seem to work in nextjs right now, so temporarily disabling (it always hits the cache, and never revalidates)
  ).then(res => res.json())) as IW10Meta;

  const versionKey = Object.keys(data)
    .reverse()
    .find(x => x.startsWith(version));
  if (!versionKey) return null;

  const versionData = data[versionKey as keyof IW10Meta];

  const archKey = Object.keys(versionData.Archs).find(x => x == arch);
  if (!archKey) return null;

  const updateIds = versionData.Archs[archKey as keyof IW10Archs]?.UpdateIds;
  if (!updateIds || updateIds.length === 0) return null;

  return updateIds[updateIds.length - 1];
}

export const meta: IAPIRouteMetaData = {
  desc: 'Returns a download url using update_id or version. Includes GDK (Game Development Kit) support flag for versions 1.21.120.21 onwards.',
};
