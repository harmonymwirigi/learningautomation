import StudyProgress from '../components/StudyProgress';

export default function Progress() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Study Progress</h1>
        <p className="mt-1 text-sm text-slate-400">
          Worked out from what you already record — syllabus topics you mark covered,
          assignments you complete, quiz scores, and time logged in the study log.
        </p>
      </div>

      <StudyProgress />
    </div>
  );
}
