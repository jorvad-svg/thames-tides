interface LoadingScreenProps {
  error?: string | null;
}

export function LoadingScreen({ error }: LoadingScreenProps) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-title">Thames Tides</div>
        {error ? (
          <div className="loading-error">{error}</div>
        ) : (
          <>
            <div className="loading-dots">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
            <div className="loading-subtitle">Reading the river...</div>
          </>
        )}
      </div>
    </div>
  );
}
