import { Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { learningModes } from '../data/modes';

const ModeSelector = () => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {learningModes.map((mode) => {
        return (
          <div 
            key={mode.id}
            className="relative overflow-hidden rounded-3xl border-2 border-gray-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
            style={{ borderBottomWidth: '4px' }}
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${mode.bgClass} text-white shadow-sm`}>
                  {mode.icon}
                </div>
                <div>
                  <button onClick={() => navigate(`/learn/${mode.id}`)} className={`flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 ${mode.textClass} hover:bg-gray-200 transition`}>
                    <Play size={20} fill="currentColor" className="ml-1" />
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-xl font-black text-gray-700">{mode.title}</h2>
                <p className="mt-2 font-bold text-gray-500">{mode.desc}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ModeSelector;
