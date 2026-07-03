import { Layout } from '@/components/layout/Layout'
import { UnderConstruction } from '@/components/common/UnderConstruction'

export function TransactionDeskPage() {
  return (
    <Layout title="TransactionDesk">
      <UnderConstruction
        title="TransactionDesk — Coming Soon"
        description="Digital forms, e-signatures, and full transaction workflow management are being built. This module will integrate with NY DOS disclosure requirements and NAR standards."
        eta="Q3 2024"
      />
    </Layout>
  )
}

export function ListingManagerPage() {
  return (
    <Layout title="Listing Manager">
      <UnderConstruction
        title="Listing Manager — Coming Soon"
        description="Create, publish, and manage new property listings directly from your workspace. Integration with REBNY and OneKey MLS coming soon."
        eta="Q3 2024"
      />
    </Layout>
  )
}

export function MarketingHubPage() {
  return (
    <Layout title="Marketing Hub">
      <UnderConstruction
        title="Marketing Hub — Coming Soon"
        description="Email campaigns, social media scheduling, and digital marketing tools are under development."
        eta="Q4 2024"
      />
    </Layout>
  )
}

export function BrokerCoursePage() {
  return (
    <Layout title="Broker License Course">
      <UnderConstruction
        title="Broker License Program — Coming Soon"
        description="Comprehensive broker license education and exam prep resources are being curated. In the meantime, visit the Academy for CE courses."
        eta="Q4 2024"
      />
    </Layout>
  )
}
