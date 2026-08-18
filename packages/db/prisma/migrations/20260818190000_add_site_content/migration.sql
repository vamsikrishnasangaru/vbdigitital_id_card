-- CreateTable
CREATE TABLE "SiteContent" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "heroTitle" TEXT NOT NULL,
    "heroSubtitle" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "howItWorks" JSONB NOT NULL,
    "generationSteps" JSONB NOT NULL,
    "media" JSONB NOT NULL,
    "ctaLabel" TEXT NOT NULL,
    "moreInfoTitle" TEXT NOT NULL,
    "moreInfoIntro" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);
