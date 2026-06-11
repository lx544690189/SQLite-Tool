export type SupportedLanguage = 'en' | 'zh-CN' | 'fr' | 'ja' | 'ko';
export type LanguagePreference = 'auto' | SupportedLanguage;

export interface LanguageSettings {
  languagePreference: LanguagePreference;
  resolvedLanguage: SupportedLanguage;
  vscodeLanguage: string;
}

const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['en', 'zh-CN', 'fr', 'ja', 'ko'];
const LANGUAGE_PREFERENCES: LanguagePreference[] = ['auto', ...SUPPORTED_LANGUAGES];

type HostMessageKey =
  | 'error.invalidPayload'
  | 'error.unknownMethod'
  | 'edit.default'
  | 'saveConflict.message'
  | 'saveConflict.overwrite'
  | 'saveConflict.reload';

const HOST_MESSAGES: Record<SupportedLanguage, Record<HostMessageKey, string>> = {
  en: {
    'error.invalidPayload': 'Invalid database byte payload',
    'error.unknownMethod': 'Unknown method: {method}',
    'edit.default': 'Edit data',
    'saveConflict.message':
      'The database file has been changed externally. Continuing to save may overwrite external changes.',
    'saveConflict.overwrite': 'Continue saving',
    'saveConflict.reload': 'Cancel and reload first',
  },
  'zh-CN': {
    'error.invalidPayload': '无效的数据库字节载荷',
    'error.unknownMethod': '未知方法: {method}',
    'edit.default': '编辑数据',
    'saveConflict.message': '数据库文件已被外部更改，继续保存可能会覆盖外部修改。',
    'saveConflict.overwrite': '继续保存',
    'saveConflict.reload': '取消，先重新加载',
  },
  fr: {
    'error.invalidPayload': 'Charge utile des octets de base de données non valide',
    'error.unknownMethod': 'Méthode inconnue : {method}',
    'edit.default': 'Modifier les données',
    'saveConflict.message':
      'Le fichier de base de données a été modifié en externe. Continuer à enregistrer peut écraser ces modifications.',
    'saveConflict.overwrite': "Continuer l'enregistrement",
    'saveConflict.reload': "Annuler et recharger d'abord",
  },
  ja: {
    'error.invalidPayload': 'データベースバイトのペイロードが無効です',
    'error.unknownMethod': '不明なメソッド: {method}',
    'edit.default': 'データを編集',
    'saveConflict.message':
      'データベースファイルは外部で変更されています。このまま保存すると外部の変更を上書きする可能性があります。',
    'saveConflict.overwrite': '保存を続行',
    'saveConflict.reload': 'キャンセルして先に再読み込み',
  },
  ko: {
    'error.invalidPayload': '데이터베이스 바이트 페이로드가 올바르지 않습니다',
    'error.unknownMethod': '알 수 없는 메서드: {method}',
    'edit.default': '데이터 편집',
    'saveConflict.message':
      '데이터베이스 파일이 외부에서 변경되었습니다. 계속 저장하면 외부 변경 사항을 덮어쓸 수 있습니다.',
    'saveConflict.overwrite': '계속 저장',
    'saveConflict.reload': '취소하고 먼저 다시 불러오기',
  },
};

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

export function normalizeLanguagePreference(value: unknown): LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference)
    ? (value as LanguagePreference)
    : 'auto';
}

export function resolveLanguage(preference: LanguagePreference, vscodeLanguage: string): SupportedLanguage {
  if (preference !== 'auto') {
    return preference;
  }

  const normalized = vscodeLanguage.toLowerCase();
  if (normalized === 'zh-cn' || normalized === 'zh' || normalized.startsWith('zh-hans')) {
    return 'zh-CN';
  }
  const primary = normalized.split(/[-_]/)[0];
  return isSupportedLanguage(primary) ? primary : 'en';
}

export function formatMessage(
  language: SupportedLanguage,
  key: HostMessageKey,
  params: Record<string, string | number> = {},
): string {
  return HOST_MESSAGES[language][key].replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}
