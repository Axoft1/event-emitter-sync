/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventDelayedRepository } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { triggerRandomly } from "./utils";

const MAX_EVENTS = 1000;
const SAVE_EVENT = 300; // Interval for saving events in milliseconds

enum EventName {
  EventA = "A",
  EventB = "B",
}
const EVENT_NAMES = [EventName.EventA, EventName.EventB];

/*

  An initial configuration for this case

*/

function init() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventA), MAX_EVENTS);
  triggerRandomly(() => emitter.emit(EventName.EventB), MAX_EVENTS);

  const repository = new EventRepository();
  const handler = new EventHandler(emitter, repository);

  const resultsTester = new ResultsTester({
    eventNames: EVENT_NAMES,
    emitter,
    handler,
    repository,
  });
  resultsTester.showStats(20);
}

/* Please do not change the code above this line */
/* ----–––––––––––––––––––––––––––––––––––––---- */

/*

  The implementation of EventHandler and EventRepository is up to you.
  Main idea is to subscribe to EventEmitter, save it in local stats
  along with syncing with EventRepository.

  The implementation of EventHandler and EventRepository is flexible and left to your discretion.
  The primary objective is to subscribe to EventEmitter, record the events in `.eventStats`,
  and ensure synchronization with EventRepository.

  The ultimate aim is to have the `.eventStats` of EventHandler and EventRepository
  have the same values (and equal to the actual events fired by the emitter) by the
  time MAX_EVENTS have been fired.

*/

class EventHandler extends EventStatistics<EventName> {
  repository: EventRepository; // Reference to the repository where events will be saved
  eventBuffer: Map<EventName, number> = new Map(); // Buffer to accumulate events before saving
  isFlushing: boolean = false; // Flag to indicate whether the buffer is being flushed
  flushInterval: number; // Time interval for periodically flushing the buffer
  bufferThreshold: number = 150; // Threshold at which the buffer should be flushed


  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;
    this.flushInterval = SAVE_EVENT; // Set the interval for saving events


    // Subscribe to both EventA and EventB from the EventEmitter
    for (const eventName of EVENT_NAMES) {
      emitter.subscribe(eventName, () => {
        this.incrementStats(eventName); // Update local stats for each event
        this.bufferEvent(eventName); // Add the event to the buffer
      });
    }


    this.startPeriodicFlush();
  }

  incrementStats(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
  }

  // Add events to the buffer and check if the buffer has reached the threshold
  bufferEvent(eventName: EventName) {
    const currentCount = this.eventBuffer.get(eventName) || 0;
    this.eventBuffer.set(eventName, currentCount + 1);

    // If the buffer exceeds the threshold, flush it immediately
    if (this.eventBuffer.get(eventName)! >= this.bufferThreshold) {
      this.flushBuffer();
    }
  }

  // Periodically flush the buffer at the specified interval
  startPeriodicFlush() {
    setInterval(() => {
      if (!this.isFlushing && this.eventBuffer.size > 0) {
        this.flushBuffer();
      }
    }, this.flushInterval);
  }

  // Flush the buffer: save all buffered events to the repository
  async flushBuffer() {
    if (this.isFlushing) return;// Avoid overlapping flushes
    this.isFlushing = true;

    const bufferCopy = new Map(this.eventBuffer); // Copy the buffer for processing
    this.eventBuffer.clear(); // Clear the buffer after copying

    // Iterate over the buffer and save events to the repository
    for (const [eventName, count] of bufferCopy) {
      try {
        await this.repository.saveMultipleEvents(eventName, count);
      } catch (error) {
        console.warn(`Failed to save events for ${eventName}, retrying...`);
        this.bufferEvent(eventName); // If saving fails, re-add the events to the buffer for retry
      }
    }

    this.isFlushing = false;
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  async saveMultipleEvents(eventName: EventName, count: number) {
    this.setStats(eventName, this.getStats(eventName) + count);
  }
}

init();