export type SiteStat = { label: string; value: string };
export type SiteStep = { title: string; body: string };
export type SiteMedia = {
  id: string;
  kind: 'image' | 'video';
  url: string;
  caption: string;
  placement: 'gallery' | 'info';
};

export type SiteContentPayload = {
  id: string;
  heroTitle: string;
  heroSubtitle: string;
  stats: SiteStat[];
  howItWorks: SiteStep[];
  generationSteps: SiteStep[];
  media: SiteMedia[];
  ctaLabel: string;
  moreInfoTitle: string;
  moreInfoIntro: string;
  updatedAt?: string;
};

export const DEFAULT_SITE_CONTENT: SiteContentPayload = {
  id: 'default',
  heroTitle: 'Smart School ID Card Management',
  heroSubtitle:
    'Complete platform for managing student onboarding, ID card design, printing workflow, and delivery tracking — all in one place.',
  stats: [
    { label: 'Schools Managed', value: '500+' },
    { label: 'Cards Generated', value: '1M+' },
    { label: 'Uptime', value: '99.9%' },
    { label: 'Support', value: '24/7' },
  ],
  howItWorks: [
    {
      title: 'Add students',
      body: 'Teachers and school admins enroll students with photos, class, and parent details — even offline. Records sync when the connection returns.',
    },
    {
      title: 'Pick a template',
      body: 'Super admin designs the school ID card once. Every student photo and field drops into the same layout automatically.',
    },
    {
      title: 'Generate cards',
      body: 'Select a class or filtered list and generate print-ready cards in a batch. Preview each card before download.',
    },
    {
      title: 'Download or print',
      body: 'Export PNG/PDF ZIPs or send files to Google Drive. Track printing and delivery from one dashboard.',
    },
  ],
  generationSteps: [
    {
      title: '1. Choose a template',
      body: 'The school’s default ID template (front design, photo slot, and field layout) is loaded for the selected students.',
    },
    {
      title: '2. Merge student data',
      body: 'Name, class, admission number, photo, and other fields are filled into the card slots. Edited photos use the latest saved portrait; the original stays as backup.',
    },
    {
      title: '3. Render each card',
      body: 'The server renders high-resolution images of every card, matching the designer preview exactly.',
    },
    {
      title: '4. Pack and deliver',
      body: 'Finished cards are zipped for download or uploaded to Drive. Failed cards can be retried without regenerating the whole batch.',
    },
  ],
  media: [],
  ctaLabel: 'More info',
  moreInfoTitle: 'How VB Digital ID Cards work',
  moreInfoIntro:
    'From student enrollment to a print-ready ID card, the platform keeps one source of truth for photos, templates, and generated files.',
};
