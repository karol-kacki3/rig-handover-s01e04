import type { NightDigest } from '../digest/types.js';

export function Digest({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest · {digest.night}</h1>
      {!digest.found ? (
        <p>night not found</p>
      ) : (
        <>
          <p class={digest.malformedLines > 0 ? 'warn' : 'mute'}>
            malformed lines: {digest.malformedLines}
          </p>
          {digest.rows.length === 0 ? (
            <p class="mute">nothing ran</p>
          ) : (
            <>
              <p class="mute">Marked rows had a failure; marked retry counts are 3 or more.</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">job</th>
                    <th scope="col">owner</th>
                    <th scope="col">runs</th>
                    <th scope="col">retries</th>
                    <th scope="col">last status</th>
                    <th scope="col">last error</th>
                    <th scope="col">first time</th>
                    <th scope="col">last time</th>
                  </tr>
                </thead>
                <tbody>
                  {digest.rows.map((row) => (
                    <tr class={row.hasFailure ? 'warn' : undefined}>
                      <td>{row.job}</td>
                      <td>{row.owner ?? '—'}</td>
                      <td>{row.runs}</td>
                      <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
                      <td>{row.lastStatus}{row.hasFailure ? ' · failure recorded' : ''}</td>
                      <td>{row.lastError ?? '—'}</td>
                      <td>{row.firstAt}</td>
                      <td>{row.lastAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  );
}
