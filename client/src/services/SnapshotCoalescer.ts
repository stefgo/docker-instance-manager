/**
 * Reads a snapshot on request, one at a time, and folds the requests that arrive while one
 * is being read into a single further read.
 *
 * Every relevant Docker event used to read its own snapshot the moment it arrived. A
 * `compose up` of ten containers is some thirty events within seconds, and each snapshot is
 * four lists plus an inspect per container -- all of them running side by side, so that an
 * earlier one could finish after a later one and leave the older state standing as the last
 * word. One read at a time settles both: a burst costs two reads instead of thirty, and
 * what is delivered last was read last.
 *
 * A request during a read is not dropped, because the read under way may have passed the
 * thing that changed. It is answered by the read that follows, which starts after the
 * request and therefore sees it.
 */
export class SnapshotCoalescer<T> {
    private running = false;
    private again = false;

    constructor(
        private readonly read: () => Promise<T>,
        private readonly deliver: (snapshot: T) => void,
        private readonly onError: (err: unknown) => void,
    ) {}

    request(): void {
        if (this.running) {
            this.again = true;
            return;
        }
        this.running = true;
        void this.run();
    }

    private async run(): Promise<void> {
        do {
            this.again = false;
            try {
                this.deliver(await this.read());
            } catch (err) {
                this.onError(err);
            }
        } while (this.again);
        this.running = false;
    }
}
