'use client';
// The event composer: the task form with the day and the time open in the
// form (a mini calendar beside the time columns) and a time required. An event
// on Dash is a task with a day and a time, like everywhere else in Mythic.
import TaskForm from './TaskForm.jsx';

export default function EventForm(props) {
  return <TaskForm {...props} event />;
}
