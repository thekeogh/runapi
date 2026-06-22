import {
  faker,
  fakerCS_CZ,
  fakerDA,
  fakerDE,
  fakerDE_AT,
  fakerDE_CH,
  fakerEN_AU,
  fakerEN_CA,
  fakerEN_GB,
  fakerEN_IE,
  fakerEN_IN,
  fakerEN_US,
  fakerEN_ZA,
  fakerES,
  fakerES_MX,
  fakerFI,
  fakerFR,
  fakerFR_BE,
  fakerFR_CA,
  fakerIT,
  fakerJA,
  fakerNB_NO,
  fakerNL,
  fakerNL_BE,
  fakerPL,
  fakerPT_BR,
  fakerPT_PT,
  fakerSV,
  fakerZH_CN
} from '@faker-js/faker';
import type { SignatureInfo, TypeProperty } from './types';

function cleanType(type: string): string {
  return type
    .replace(/\s*\|\s*undefined/g, '')
    .replace(/undefined\s*\|\s*/g, '')
    .replace(/\s*\|\s*null/g, '')
    .replace(/null\s*\|\s*/g, '')
    .trim();
}

function literalValue(type: string): unknown {
  const literal = cleanType(type).match(/^["'](.+)["']$/);
  if (literal) return literal[1];
  if (/^-?\d+(?:\.\d+)?$/.test(type)) return Number(type);
  if (type === 'true') return true;
  if (type === 'false') return false;
  return undefined;
}

function splitUnion(type: string): string[] {
  return type
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'undefined' && part !== 'null');
}

function arrayElementType(type: string): string | null {
  const cleaned = cleanType(type);
  const generic = cleaned.match(/^Array<(.+)>$/);
  if (generic) return generic[1].trim();
  const shorthand = cleaned.match(/^(.+)\[\]$/);
  if (shorthand) return shorthand[1].trim();
  return null;
}

function recordValueType(type: string): string | null {
  const match = cleanType(type).match(/^Record<[^,]+,\s*(.+)>$/);
  return match?.[1]?.trim() ?? null;
}

type FieldName = {
  compact: string;
  raw: string;
  words: string[];
};

type GenerationContext = {
  addressFaker?: typeof faker;
  preferredCountryCode?: string;
  countryCode?: string;
};

const countryCodesWithSubdivisionCodes: Record<string, string[]> = {
  AU: ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'],
  BR: ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'],
  CA: ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'],
  IN: ['AP', 'AR', 'AS', 'BR', 'CG', 'GA', 'GJ', 'HR', 'HP', 'JH', 'KA', 'KL', 'MP', 'MH', 'MN', 'ML', 'MZ', 'NL', 'OD', 'PB', 'RJ', 'SK', 'TN', 'TS', 'TR', 'UP', 'UK', 'WB'],
  JP: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'],
  MX: ['AGU', 'BCN', 'BCS', 'CAM', 'CHP', 'CHH', 'CMX', 'COA', 'COL', 'DUR', 'GUA', 'GRO', 'HID', 'JAL', 'MEX', 'MIC', 'MOR', 'NAY', 'NLE', 'OAX', 'PUE', 'QUE', 'ROO', 'SLP', 'SIN', 'SON', 'TAB', 'TAM', 'TLA', 'VER', 'YUC', 'ZAC'],
  US: ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY']
};

const subdivisionAwareCountryCodes = ['US', 'CA', 'AU', 'BR', 'MX', 'IN', 'JP', 'GB', 'IE'] as const;

const addressFakersByCountryCode: Record<string, typeof faker> = {
  AT: fakerDE_AT,
  AU: fakerEN_AU,
  BE: fakerFR_BE,
  BR: fakerPT_BR,
  CA: fakerEN_CA,
  CH: fakerDE_CH,
  CN: fakerZH_CN,
  CZ: fakerCS_CZ,
  DE: fakerDE,
  DK: fakerDA,
  ES: fakerES,
  FI: fakerFI,
  FR: fakerFR,
  GB: fakerEN_GB,
  IE: fakerEN_IE,
  IN: fakerEN_IN,
  IT: fakerIT,
  JP: fakerJA,
  MX: fakerES_MX,
  NL: fakerNL,
  NO: fakerNB_NO,
  PL: fakerPL,
  PT: fakerPT_PT,
  SE: fakerSV,
  US: fakerEN_US,
  ZA: fakerEN_ZA
};

const addressCountryCodes = Object.keys(addressFakersByCountryCode);

function fieldName(name: string): FieldName {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim();

  const words = spaced ? spaced.split(/\s+/) : [];
  return {
    compact: words.join(''),
    raw: name.toLowerCase(),
    words
  };
}

function hasWord(field: FieldName, word: string): boolean {
  return field.words.includes(word);
}

function hasAnyWord(field: FieldName, words: string[]): boolean {
  return words.some((word) => hasWord(field, word));
}

function compactMatches(field: FieldName, pattern: RegExp): boolean {
  return pattern.test(field.compact);
}

function isCountryField(field: FieldName): boolean {
  return compactMatches(field, /country(code)?$/);
}

function isPostalCodeField(field: FieldName): boolean {
  return hasWord(field, 'postcode') || hasWord(field, 'postal') || hasWord(field, 'zipcode') || field.compact === 'zip';
}

function isCityField(field: FieldName): boolean {
  return hasWord(field, 'city') || hasWord(field, 'town');
}

function isAddressLineOneField(field: FieldName): boolean {
  return compactMatches(field, /(address)?line1/) || compactMatches(field, /address1/) || hasWord(field, 'street');
}

function isAddressLineTwoField(field: FieldName): boolean {
  return compactMatches(field, /(address)?line2/) || compactMatches(field, /address2/);
}

function isAddressField(field: FieldName): boolean {
  return isAddressLineOneField(field) ||
    isAddressLineTwoField(field) ||
    isPostalCodeField(field) ||
    isCityField(field) ||
    isSubdivisionField(field) ||
    hasWord(field, 'address');
}

function isSubdivisionField(field: FieldName): boolean {
  return hasAnyWord(field, ['county', 'state', 'province', 'region']);
}

function isSubdivisionCodeField(field: FieldName): boolean {
  return compactMatches(field, /^(state|province|region|county)(code|abbr|short)$/) ||
    compactMatches(field, /^(code|abbr|short)(state|province|region|county)$/);
}

function isoCountryCode(context?: GenerationContext): string {
  return context?.preferredCountryCode ?? faker.location.countryCode('alpha-2');
}

function locationFaker(context?: GenerationContext): typeof faker {
  return context?.addressFaker ?? faker;
}

function subdivisionCode(countryCode?: string): string {
  const codes = countryCode ? countryCodesWithSubdivisionCodes[countryCode.toUpperCase()] : undefined;
  return faker.helpers.arrayElement(codes ?? countryCodesWithSubdivisionCodes.US);
}

function subdivisionValue(name: string, context?: GenerationContext): string {
  const field = fieldName(name);
  const countryCode = (context?.countryCode ?? context?.preferredCountryCode)?.toUpperCase();
  if (isSubdivisionCodeField(field)) return subdivisionCode(countryCode);
  if (countryCode && countryCodesWithSubdivisionCodes[countryCode]) return subdivisionCode(countryCode);
  return locationFaker(context).location.state();
}

function shouldGenerateOptionalProperty(property: TypeProperty, context: GenerationContext): boolean {
  const field = fieldName(property.name);
  const countryCode = (context.countryCode ?? context.preferredCountryCode)?.toUpperCase();
  return isSubdivisionField(field) && Boolean(countryCode && countryCodesWithSubdivisionCodes[countryCode]);
}

function isAddressObject(properties: TypeProperty[]): boolean {
  const fields = properties.map((property) => fieldName(property.name));
  return fields.some(isCountryField) && fields.some(isAddressField);
}

function semanticString(name: string, context?: GenerationContext): string | null {
  const field = fieldName(name);

  if (hasWord(field, 'email') || compactMatches(field, /email(address)?/)) return faker.internet.email().toLowerCase();
  if (hasAnyWord(field, ['phone', 'mobile', 'telephone', 'tel']) || compactMatches(field, /(phone|mobile|telephone|tel)(number)?/)) return faker.phone.number();
  if (hasAnyWord(field, ['url', 'uri', 'href', 'link'])) return faker.internet.url();
  if (hasAnyWord(field, ['domain', 'hostname'])) return faker.internet.domainName();
  if (hasWord(field, 'username') || field.compact === 'username' || field.compact === 'login') return faker.internet.username();
  if (hasWord(field, 'password') || hasWord(field, 'secret')) return faker.internet.password({ length: 16 });
  if (hasAnyWord(field, ['token', 'hash', 'nonce'])) return faker.string.alphanumeric({ length: 32 });
  if (hasWord(field, 'ip') || compactMatches(field, /ipaddress/)) return faker.internet.ip();
  if (hasWord(field, 'mac') || compactMatches(field, /macaddress/)) return faker.internet.mac();

  if (
    field.compact === 'id' ||
    field.compact === 'uuid' ||
    field.words.at(-1) === 'id' ||
    (field.compact.endsWith('id') && !['valid', 'invalid', 'grid'].includes(field.compact)) ||
    field.raw.includes('_id') ||
    field.raw.includes('-id')
  ) {
    return faker.string.uuid();
  }
  if (hasWord(field, 'uid')) return faker.lorem.slug();
  if (hasWord(field, 'slug') || compactMatches(field, /slug$/)) return faker.lorem.slug();

  if (hasAnyWord(field, ['company', 'organisation', 'organization', 'business', 'vendor', 'supplier', 'merchant'])) return faker.company.name();
  if (hasWord(field, 'brand')) return faker.company.name();
  if (hasWord(field, 'department') || hasWord(field, 'category')) return faker.commerce.department();

  if (compactMatches(field, /^(first|given|fore)name$/) || field.compact === 'firstname' || field.compact === 'givenname' || field.raw === 'fn') return faker.person.firstName();
  if (compactMatches(field, /^(last|family|sur)name$/) || field.compact === 'lastname' || field.compact === 'surname' || field.raw === 'ln') return faker.person.lastName();
  if (compactMatches(field, /^middlename$/)) return faker.person.middleName();
  if (compactMatches(field, /^(full|display|contact|customer)name$/)) return faker.person.fullName();
  if (field.compact === 'name') return faker.person.fullName();
  if (hasWord(field, 'job') && hasWord(field, 'title')) return faker.person.jobTitle();
  if (hasWord(field, 'role')) return faker.person.jobType();

  if (hasWord(field, 'currency') || compactMatches(field, /currency(code)?/)) return faker.finance.currencyCode();
  if (hasWord(field, 'iban')) return faker.finance.iban();
  if (hasWord(field, 'bic') || hasWord(field, 'swift')) return faker.finance.bic();
  if (compactMatches(field, /account(number|no)$/)) return faker.finance.accountNumber();
  if (compactMatches(field, /accountname$/)) return faker.finance.accountName();

  if (isCountryField(field)) return isoCountryCode(context);
  if (isPostalCodeField(field)) return locationFaker(context).location.zipCode();
  if (isCityField(field)) return locationFaker(context).location.city();
  if (isSubdivisionField(field)) return subdivisionValue(name, context);
  if (isAddressLineOneField(field)) return locationFaker(context).location.streetAddress();
  if (isAddressLineTwoField(field)) return locationFaker(context).location.secondaryAddress();
  if (hasWord(field, 'building')) return locationFaker(context).location.buildingNumber();
  if (hasWord(field, 'address')) return locationFaker(context).location.streetAddress();

  if (hasWord(field, 'product') && hasWord(field, 'description')) return faker.commerce.productDescription();
  if (hasWord(field, 'product') || hasWord(field, 'item') || hasWord(field, 'device')) return faker.commerce.productName();
  if (hasWord(field, 'sku')) return faker.string.alphanumeric({ length: 10, casing: 'upper' });

  if (hasWord(field, 'title') || hasWord(field, 'headline')) return faker.lorem.words({ min: 2, max: 5 });
  if (hasAnyWord(field, ['description', 'summary', 'bio', 'body', 'message', 'notes', 'comment'])) return faker.lorem.sentence();
  if (hasWord(field, 'status')) return faker.helpers.arrayElement(['draft', 'active', 'pending', 'complete']);
  if (hasWord(field, 'type') || hasWord(field, 'kind')) return faker.lorem.word();
  if (hasWord(field, 'tier') || hasWord(field, 'plan')) return faker.helpers.arrayElement(['basic', 'standard', 'premium']);
  if (hasWord(field, 'color') || hasWord(field, 'colour')) return faker.color.human();
  if (hasWord(field, 'timezone') || hasWord(field, 'tz')) return 'Europe/London';
  if (hasWord(field, 'locale')) return 'en-GB';
  if (hasWord(field, 'language') || hasWord(field, 'lang')) return faker.location.language().alpha2;
  if (hasWord(field, 'image') || hasWord(field, 'avatar') || hasWord(field, 'photo')) return faker.image.url();
  if (hasWord(field, 'date') || compactMatches(field, /(created|updated|deleted|published|effective|expires|expired)at$/)) return faker.date.recent().toISOString();
  if (hasWord(field, 'time')) return faker.date.recent().toISOString();
  if (hasWord(field, 'code')) return faker.string.alphanumeric({ length: 8, casing: 'upper' });
  if (hasWord(field, 'reference') || hasWord(field, 'ref')) return faker.string.alphanumeric({ length: 12, casing: 'upper' });

  return null;
}

function semanticBoolean(name: string): boolean {
  const field = fieldName(name);

  if (hasAnyWord(field, ['enabled', 'active', 'available', 'valid', 'verified', 'published', 'subscribed'])) return true;
  if (hasAnyWord(field, ['disabled', 'deleted', 'archived', 'expired', 'cancelled', 'canceled'])) return false;

  return faker.datatype.boolean();
}

function semanticNumber(name: string): number {
  const field = fieldName(name);

  if (hasAnyWord(field, ['amount', 'price', 'cost', 'total', 'subtotal', 'discount', 'fee', 'tax', 'vat'])) {
    return faker.number.float({ min: 1, max: 500, fractionDigits: 2 });
  }
  if (hasAnyWord(field, ['quantity', 'qty', 'count', 'stock', 'inventory'])) {
    return faker.number.int({ min: 1, max: 10 });
  }
  if (hasWord(field, 'latitude') || field.compact === 'lat') return Number(faker.location.latitude());
  if (hasWord(field, 'longitude') || field.compact === 'lng' || field.compact === 'lon') return Number(faker.location.longitude());
  if (hasAnyWord(field, ['percent', 'percentage', 'rate'])) return faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
  if (hasAnyWord(field, ['weight', 'height', 'width', 'length', 'depth'])) return faker.number.float({ min: 1, max: 200, fractionDigits: 2 });
  if (hasWord(field, 'age')) return faker.number.int({ min: 18, max: 80 });
  if (hasWord(field, 'year')) return faker.date.future().getFullYear();
  if (hasWord(field, 'month')) return faker.number.int({ min: 1, max: 12 });
  if (hasWord(field, 'day')) return faker.number.int({ min: 1, max: 28 });
  if (hasAnyWord(field, ['hour', 'minute', 'second', 'duration'])) return faker.number.int({ min: 1, max: 60 });
  if (hasAnyWord(field, ['page', 'offset', 'limit', 'size'])) return faker.number.int({ min: 1, max: 50 });

  return faker.number.int({ min: 1, max: 1000 });
}

function fakeFromType(name: string, type: string, properties?: TypeProperty[], depth = 0, context: GenerationContext = {}): unknown {
  const literal = literalValue(type);
  if (typeof literal !== 'undefined') return literal;

  const unionParts = splitUnion(type);
  if (unionParts.length > 1) {
    return fakeFromType(name, unionParts[0]!, properties, depth, context);
  }

  const elementType = arrayElementType(type);
  if (elementType) {
    return [fakeFromType(name.replace(/s$/, ''), elementType, undefined, depth + 1, context)];
  }

  const recordType = recordValueType(type);
  if (recordType) {
    return { sample: fakeFromType('sample', recordType, undefined, depth + 1, context) };
  }

  if (properties?.length && depth < 4) {
    return fakeObject(properties, depth + 1);
  }

  const cleaned = cleanType(type).toLowerCase();
  if (cleaned === 'string') return semanticString(name, context) ?? faker.lorem.word();
  if (cleaned === 'number') return semanticNumber(name);
  if (cleaned === 'boolean') return semanticBoolean(name);
  if (cleaned === 'null') return null;
  if (cleaned === 'date') return faker.date.recent().toISOString();
  if (cleaned === 'unknown' || cleaned === 'any') return semanticString(name, context) ?? faker.lorem.word();

  return semanticString(name, context) ?? faker.lorem.word();
}

function fakeObject(properties: TypeProperty[], depth: number): Record<string, unknown> {
  const context: GenerationContext = {};
  const hasGeneratedSubdivision = properties.some((property) => !property.optional && isSubdivisionField(fieldName(property.name)));
  const hasGeneratedCountry = properties.some((property) => !property.optional && isCountryField(fieldName(property.name)));

  if (isAddressObject(properties)) {
    const countryCode = faker.helpers.arrayElement(addressCountryCodes);
    context.preferredCountryCode = countryCode;
    context.addressFaker = addressFakersByCountryCode[countryCode];
  } else if (hasGeneratedSubdivision && hasGeneratedCountry) {
    const countryCode = faker.helpers.arrayElement(subdivisionAwareCountryCodes);
    context.preferredCountryCode = countryCode;
    context.addressFaker = addressFakersByCountryCode[countryCode];
  }

  const object: Record<string, unknown> = {};
  const generated = new Set<string>();
  const countryProperty = properties.find((property) => !property.optional && isCountryField(fieldName(property.name)));

  if (countryProperty) {
    const value = fakeFromType(countryProperty.name, countryProperty.type, countryProperty.properties, depth, context);
    object[countryProperty.name] = value;
    generated.add(countryProperty.name);

    if (typeof value === 'string') {
      context.countryCode = value.toUpperCase();
    }
  }

  for (const property of properties) {
    if (generated.has(property.name)) continue;
    if (!property.optional || shouldGenerateOptionalProperty(property, context)) {
      const value = fakeFromType(property.name, property.type, property.properties, depth, context);
      object[property.name] = value;

      if (typeof value === 'string' && isCountryField(fieldName(property.name))) {
        context.countryCode = value.toUpperCase();
      }
    }
  }

  return object;
}

export function generateArgsJson(signature: SignatureInfo): string {
  const args = signature.params
    .filter((param) => !param.optional)
    .map((param) => fakeFromType(param.name, param.type, param.properties));

  return JSON.stringify(args, null, 2);
}
