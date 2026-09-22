import LoadingIndicator from "@/components/loading-indicator";

export default function Loading() {
  return <div className="loading-screen route-loading"><LoadingIndicator label="화면을 준비하는 중" scope="screen" /></div>;
}
