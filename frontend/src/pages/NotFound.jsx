
const NotFound = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center bg-slate-50">
        <img src="/404.png" alt="404 Error" className="mb-4" />
      <h1 className="text-4xl font-bold mb-4">404 - Page Not Found</h1>
      <p className="text-lg text-gray-600">
        Oops! The page you are looking for does not exist.
      </p>
        <a href="/" className="mt-4 text-blue-500 hover:underline">
        Go back to Home
      </a>  
    </div>
  );
};

export default NotFound;



