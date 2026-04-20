import path from 'path';
import { z } from 'zod';

import { getDirectories } from './utils';
import { cache } from 'react';
import { generateSchema as genSchem } from '@anatine/zod-openapi';

const API_DIR = path.join(process.cwd(), 'src/app/api/');
interface IROUTE_DATA {
  routes?: Record<string, IROUTE_DATA>;
  validate?: any;
  route?: any;
}

const GET_DOC_DATA = async () => {
  return {
    v1: {
      webhook: {
        validate: await import('./v1/webhook/validate'),
        route: await import('./v1/webhook/route'),
        routes: {
          error: {
            validate: await import('./v1/webhook/error/validate'),
            route: await import('./v1/webhook/error/route'),
          },
          'error-from-file': {
            validate: await import('./v1/webhook/error-from-file/validate'),
            route: await import('./v1/webhook/error-from-file/route'),
          },
          file: {
            validate: await import('./v1/webhook/file/validate'),
            route: await import('./v1/webhook/file/route'),
          },
        },
      },
      minecraft: {
        routes: {
          download_url: {
            validate: await import('./v1/minecraft/download_url/validate'),
            route: await import('./v1/minecraft/download_url/route'),
          },
        },
      },
    },
  } satisfies Record<IVersionKey, Record<string, IROUTE_DATA>>;
};

export type IVersionKey = `v${number}`;

export interface IAPIDocs {
  [key: IVersionKey]: IAPIRoute[];
}
export interface IAPIRoute {
  name: string;
  routes: IAPIRoute[];
  data: IAPIRouteData;
}

export interface IAPIRouteData {
  meta: IAPIRouteMetaData;
  validation_schemas: {
    // @ts-ignore idc about types rn man nothin makes sense bru its so dumb
    schema?: z.AnyZodObject;
    // @ts-ignore
    schema_string?: string;
    response_schema?: z.AnyZodObject;
    response_schema_string?: string;
    // @ts-ignore idc about types rn man nothin makes sense bru its so dumb
    [key: string]: z.Schema | string | undefined;
  };
}
export interface IAPIRouteMetaData {
  desc: string;
}

export const generateDocs = cache(async () => {
  let outData: IAPIDocs = {};
  const apiVersions = await getDirectories(API_DIR);

  for (let i in apiVersions) {
    const version = apiVersions[i];
    if (!version.match(/v\d+/))
      throw `\nInvalid API Version (${version})\nExpected: vNUM`;

    const routes = await generateSubroutes(path.join(API_DIR, version));
    outData[version as IVersionKey] = routes;
  }

  return outData;
});

export const getDocsRoute = async (version: IVersionKey, routes: string[]) => {
  const docs = await generateDocs();

  const data = docs[version];

  let doc = data.find(x => x.name == routes[0]);

  if (!doc) return null;

  routes.forEach((route, idx) => {
    if (idx == 0) return;

    if (!doc) return;

    const subDoc = doc.routes?.find(x => x.name == route);
    if (subDoc) doc = subDoc;
  });

  if (!doc) return null;

  return doc;
};

function interleave<T>(arr: T[], thing: T): T[] {
  return ([] as T[]).concat(...arr.map(n => [n, thing])).slice(0, -1);
}

function deepObjKey<T extends Record<string | number | symbol, any>>(
  obj: T,
  keys: string[]
): any {
  return keys.reduce(
    (value, key) =>
      value && value[key] !== null && value[key] !== undefined
        ? value[key]
        : null,
    obj
  );
}

async function generateSubroutes(api_path: string): Promise<IAPIRoute[]> {
  const DOC_DATA = await GET_DOC_DATA();

  let new_routes: IAPIRoute[] = [];

  const routes = await getDirectories(api_path);
  for (const i in routes) {
    const route = routes[i];

    const shortPath = api_path.match(/src(\\|\/)app(\\|\/)api(\\|\/).+$/)?.[0];
    if (!shortPath) throw new Error('huh');

    let objPath = shortPath.split(/\\|\//).slice(3);
    const version = objPath.shift();

    if (!version || !/v\d+/.test(version || ''))
      throw new Error('uhhh dumb invalid version');

    objPath.push(route);
    objPath = interleave(objPath, 'routes');
    objPath.unshift(version);

    const data = deepObjKey(DOC_DATA, objPath) as IROUTE_DATA;

    let newRoute: IAPIRoute = {
      name: route,
      routes: await generateSubroutes(path.resolve(api_path, route)),
      data: {
        meta: {
          ...data.route?.meta,
        },
        validation_schemas: {
          schema_string: data.validate?.schema_string,
          schema: data.validate?.schema,
          response_schema_string: data.validate?.response_schema_string,
          response_schema: data.validate?.responseSchema,
        },
      },
    };

    new_routes.push(newRoute);
  }

  return new_routes;
}

export const generateSchema = (schema: z.AnyZodObject) => {
  const newSchem = genSchem(schema);

  return newSchem as IDocSchemaType;
};

export type IDocSchemaType =
  | IDocSchemaObject
  | IDocSchemaArray
  | IDocSchemaBoolean
  | IDocSchemaString
  | IDocSchemaNumber;

interface IRootDocSchemaType {
  title?: string;
  description?: string;
}

export interface IDocSchemaBoolean extends IRootDocSchemaType {
  type: 'boolean';
}

export interface IDocSchemaString extends IRootDocSchemaType {
  type: 'string';
  minLength?: number;
  maxLength?: number;
  enum?: string[];
  format?: string; // date-time
}

export interface IDocSchemaNumber extends IRootDocSchemaType {
  type: 'number';
  minimum?: number;
  maximum?: number;
}

export interface IDocSchemaObject extends IRootDocSchemaType {
  type: 'object';
  properties: {
    [key: string]: IDocSchemaType;
  };
  required?: (keyof IDocSchemaObject['properties'])[];
}

export interface IDocSchemaArray extends IRootDocSchemaType {
  type: 'array';
  items: IDocSchemaType;
  maxItems?: number;
}
