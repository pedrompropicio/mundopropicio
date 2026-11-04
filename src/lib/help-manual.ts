/**
 * Manual de orientação completo — organizado por módulos.
 * Cada secção contém tópicos com título e conteúdo detalhado.
 */

export interface HelpTopic {
  title: string;
  content: string;
  image?: string; // import key for illustration
}

export interface HelpSection {
  id: string;
  title: string;
  icon: string; // lucide icon name
  image?: string; // import key for illustration
  topics: HelpTopic[];
}

const helpManual: HelpSection[] = [];

export default helpManual;
