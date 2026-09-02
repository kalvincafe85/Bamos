import SharedItineraryClient from "./SharedItineraryClient";

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedItineraryClient token={token} />;
}
