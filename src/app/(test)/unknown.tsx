import Head from 'next/head';

export default function Dashboard() {
  return (
    <>
      <Head>
        <title>SPARQ Dashboard</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-8 bg-gradient-to-r from-blue-500 to-purple-600 p-4 rounded-xl shadow-lg">
          <div className="flex items-center">
            <img src="/logo.png" alt="SPARQ Logo" className="w-12 h-12 mr-3 rounded-full border-2 border-white" />
            <h1 className="text-3xl font-extrabold text-white tracking-tight">SPARQ</h1>
          </div>
          <div className="flex space-x-3">
            <button className="bg-gradient-to-r from-green-400 to-green-600 text-white px-5 py-2 rounded-lg font-semibold hover:from-green-500 hover:to-green-700 transition duration-300 shadow-md">
              Create New Spark
            </button>
            <button className="bg-gradient-to-r from-orange-400 to-orange-600 text-white px-5 py-2 rounded-lg font-semibold hover:from-orange-500 hover:to-orange-700 transition duration-300 shadow-md">
              Withdraw Earnings
            </button>
          </div>
        </div>

        {/* User Info */}
        <div className="flex items-center mb-8 bg-white p-4 rounded-xl shadow-md">
          <img src="https://via.placeholder.com/40" alt="User" className="w-12 h-12 rounded-full mr-3 border-2 border-blue-200" />
          <h2 className="text-xl font-semibold text-gray-800">Jane Doe</h2>
        </div>

        {/* Financial Stats */}
        <div className="flex justify-between mb-8 space-x-4">
          <div className="bg-gradient-to-br from-white to-blue-50 p-6 rounded-xl shadow-lg w-1/3 hover:shadow-xl transition duration-300">
            <p className="text-gray-500 text-sm font-medium">Balance</p>
            <p className="text-3xl font-bold text-blue-600">$20,453.28</p>
          </div>
          <div className="bg-gradient-to-br from-white to-purple-50 p-6 rounded-xl shadow-lg w-1/3 hover:shadow-xl transition duration-300">
            <p className="text-gray-500 text-sm font-medium">Pending</p>
            <p className="text-3xl font-bold text-purple-600">$2,300.00</p>
          </div>
          <div className="bg-gradient-to-br from-white to-green-50 p-6 rounded-xl shadow-lg w-1/3 hover:shadow-xl transition duration-300">
            <p className="text-gray-500 text-sm font-medium">Total Earnings</p>
            <p className="text-3xl font-bold text-green-600">$48,823.23</p>
          </div>
        </div>

        {/* Content and Analytics Sections */}
        <div className="flex justify-between">
          {/* Content Table */}
          <div className="bg-white p-6 rounded-xl shadow-lg w-2/3">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Content</h3>
            <div className="flex text-gray-600 font-medium mb-3 bg-gray-100 p-2 rounded-lg">
              <span className="w-1/4">Title</span>
              <span className="w-1/6">Price</span>
              <span className="w-1/6">Status</span>
              <span className="w-1/6">Views</span>
              <span className="w-1/6">Earnings</span>
              <span className="w-1/12">Actions</span>
            </div>
            <div className="flex items-center py-3 border-b border-gray-100 hover:bg-gray-50 transition duration-200">
              <img src="/logo.png" alt="Content" className="w-10 h-10 rounded-lg mr-2" />
              <span className="w-1/4 text-gray-700">NO Spark Yet</span>
              <span className="w-1/6 text-gray-700">0.00</span>
              <span className="w-1/6 text-green-500 font-medium">Inactive</span>
              <span className="w-1/6 text-gray-700">0.00</span>
              <span className="w-1/6 text-gray-700">$0.00</span>
              <button className="w-1/12 bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 transition duration-200">
                Copy Link
              </button>
            </div>
          </div>

          {/* Analytics */}
          <div className="bg-white p-6 rounded-xl shadow-lg w-1/3 ml-4">
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Analytics</h3>
            <div className="mb-4">
              <p className="text-gray-500 text-sm font-medium">Revenue</p>
              <p className="text-3xl font-bold text-blue-600">2.0k</p>
            </div>
            <div className="h-32 bg-gradient-to-r from-blue-100 to-purple-100 rounded-lg mb-4"></div> {/* Placeholder for chart */}
            <h4 className="text-lg font-semibold mt-4 text-gray-800">Top-performing Sparks</h4>
            <div className="mt-2 space-y-2">
              <p className="text-gray-700">Exclusive tutorial <span className="text-green-500 font-medium">$365</span></p>
              <p className="text-gray-700">Meal plan for athletes <span className="text-green-500 font-medium">$6,820</span></p>
              <p className="text-gray-700">Yoga routine <span className="text-green-500 font-medium">$1,467</span></p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}